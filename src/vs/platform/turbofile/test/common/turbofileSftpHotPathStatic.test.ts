/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

function methodBlock(source: string, name: string, nextName: string): string {
	const start = source.indexOf(name);
	assert.ok(start >= 0, `missing method ${name}`);
	const end = source.indexOf(nextName, start + name.length);
	assert.ok(end > start, `missing method boundary ${nextName}`);
	return source.slice(start, end).replace(/\r\n/g, '\n');
}

suite('TurboFileSftpHotPathStatic', () => {
	const servicePath = () => path.join(process.cwd(), 'src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts');

	test('confirms the source before pipelining the destructive target open with the first read', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const relay = methodBlock(service, 'private async relayRemoteFileInParallel', 'private openShell');
		const sourceOpen = relay.indexOf("await this.openRemoteFile(sourceSftp, sourcePath, 'r')");
		const targetOpen = relay.indexOf("this.openRemoteFile(targetSftp, targetPath, 'w')", sourceOpen);
		const firstRead = relay.indexOf('this.readRemoteFileChunkExact(', sourceOpen);
		const pipeline = relay.indexOf('await Promise.allSettled([', sourceOpen);
		const close = methodBlock(service, 'private closeRemoteFile', 'private async relayRemoteFileInParallel');

		assert.deepStrictEqual({
			sourceOpenPrecedesDestructiveTargetOpen: sourceOpen >= 0 && targetOpen > sourceOpen,
			pipelinesTargetOpenWithFirstRead: pipeline > sourceOpen && firstRead > pipeline
				&& relay.includes('openTarget().then(handle => { targetHandle = handle; })'),
			closesBothSidesTogether: relay.includes('await Promise.all([')
				&& relay.includes('this.closeRemoteFile(targetSftp, targetHandle)')
				&& relay.includes('this.closeRemoteFile(sourceSftp, sourceHandle)')
				&& !relay.includes('.catch(() => undefined)'),
			propagatesCloseErrors: close.includes('reject(error);')
		}, {
			sourceOpenPrecedesDestructiveTargetOpen: true,
			pipelinesTargetOpenWithFirstRead: true,
			closesBothSidesTogether: true,
			propagatesCloseErrors: true
		});
	});

	test('uses durable pane directory hints with an open-failure repair and a one-stat fallback', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const list = methodBlock(service, 'private async listRemoteDirectoryCore', 'private createRemoteDirectoryListingResult');
		const cache = methodBlock(service, 'private hasFreshRemoteDirectoryListing', 'private openSftp');
		const relay = methodBlock(service, 'private async tryStreamRelayTransfer', 'private async tryScpRelayTransfer');
		const ensure = methodBlock(service, 'private async ensureRemoteDirectory', 'private async uploadDirectoryConcurrent');
		const finalProbe = ensure.indexOf('const existing = await this.remoteStat(sftp, normalized).catch(() => undefined);');
		const traversal = ensure.indexOf('for (const segment of rest.split');

		assert.deepStrictEqual({
			remembersSuccessfulPaneDirectories: list.includes('this.rememberRemoteDirectory(options, path);')
				&& list.includes('this.rememberRemoteDirectory(options, listing.path);'),
			keepsHintsIndependentFromListingTtl: cache.includes('private hasKnownRemoteDirectory(')
				&& cache.includes('this.knownRemoteDirectories.has('),
			repairsAStaleHintOnlyAfterTargetOpenFailure: relay.includes('this.hasKnownRemoteDirectory(request.target, targetParentPath)')
				&& relay.includes('targetParentIsKnown ? async () =>')
				&& relay.includes('this.ensureRemoteDirectory(targetSftp, targetParentPath)'),
			probesTheFullPathBeforeAncestorTraversal: finalProbe >= 0 && traversal > finalProbe
		}, {
			remembersSuccessfulPaneDirectories: true,
			keepsHintsIndependentFromListingTtl: true,
			repairsAStaleHintOnlyAfterTargetOpenFailure: true,
			probesTheFullPathBeforeAncestorTraversal: true
		});
	});

	test('keeps NAS mkdir compatible when STAT reports a generic failure for existing entries', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const createDirectory = methodBlock(service, 'private async createDirectoryCore', 'async movePathsToTrash');
		const ensure = methodBlock(service, 'private async ensureRemoteDirectory', 'private async uploadDirectoryConcurrent');
		const mkdir = methodBlock(service, 'private mkdirRemote', 'private rmdirRemote');

		assert.deepStrictEqual({
			usesTaskMutationSession: createDirectory.includes('this.withSftp(endpoint')
				&& !createDirectory.includes('this.withDirectorySftp(endpoint'),
			checksParentListingAfterExistingFailure: ensure.includes('isRemotePathAlreadyExistsError(mkdirError)')
				&& ensure.includes('isRemotePathGenericFailure(mkdirError)')
				&& ensure.includes('getRemoteParentPath(current)')
				&& ensure.includes('getTransferName(current)'),
			preservesPermissionErrors: ensure.includes('if (!entry) {') && ensure.includes('throw mkdirError;'),
			fallsBackToPosixShellForSftpPermissionErrors: createDirectory.includes('isRemotePermissionError(error)')
				&& createDirectory.includes('this.withSshClient(endpoint')
				&& createDirectory.includes('buildPortablePosixMkdir(endpoint.path)')
				&& createDirectory.includes('!looksLikeWindowsPath(endpoint.path)'),
			retriesOnlyTransportFailures: createDirectory.includes('shouldRetryRemoteDirectoryRead(error)')
				&& createDirectory.includes('getRemoteDirectoryReadRetryDelay(attempt)')
				&& createDirectory.includes('REMOTE_DIRECTORY_READ_MAX_ATTEMPTS'),
			keepsMkdirErrorsVisible: mkdir.includes('reject(error);')
		}, {
			usesTaskMutationSession: true,
			checksParentListingAfterExistingFailure: true,
			preservesPermissionErrors: true,
			fallsBackToPosixShellForSftpPermissionErrors: true,
			retriesOnlyTransportFailures: true,
			keepsMkdirErrorsVisible: true
		});
	});

	test('starts directory work immediately on the warm task session and expands the pool progressively', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const connectionCount = methodBlock(service, 'private getDirectorySftpConnectionCount', 'private async collectLocalDirectoryTransferPlan');
		const pool = methodBlock(service, 'private async withSftpPool', 'private async runSftpWorkers');
		const connect = methodBlock(service, 'private async connect(', 'private async getDirectorySftpSession');

		assert.deepStrictEqual({
			smallJobsCanScaleWithoutBlockingStartup: connectionCount.includes("if (fileCount < 16 && totalBytes < SFTP_LARGE_FILE_THRESHOLD) {\n\t\t\treturn Math.min(4, fileCount);\n\t\t}"),
			usesWarmTaskSessionFirst: pool.includes('this.acquireTransferSession(endpoint, progressId)')
				&& pool.includes('const result = await task({ primary: reusableLease.session.sftp, additional });'),
			expandsWithoutWaitingForSpeculativeConnections: pool.includes('openFreshConnection(index)')
				&& pool.includes('SFTP_POOL_CONNECTION_STAGGER_MS')
				&& !pool.includes('await Promise.all(additional)'),
			tracksAndBoundsPendingConnections: pool.includes('SFTP_POOL_MAX_PENDING_CONNECTIONS')
				&& pool.includes('created => clients.push(created)')
				&& pool.includes('expansionFailed = true')
				&& connect.includes('onClientCreated?: (client: ISSHClient) => void')
				&& connect.includes('shouldCancel?: () => boolean')
				&& connect.indexOf("client\n\t\t\t\t.on('ready'") < connect.indexOf('onClientCreated?.(client);')
				&& connect.indexOf('onClientCreated?.(client);') < connect.indexOf('client.connect(config);')
				&& pool.includes('() => poolClosed || expansionFailed'),
			keepsWarmOnlyFallback: pool.includes('if (!configResult.ok)')
				&& pool.includes('expansionFailed = true;')
				&& pool.includes('return undefined;'),
			preservesCancellationAndCleanup: pool.includes('this.registerTransferCancelHandler(progressId, abortAll)')
				&& pool.includes('reusableLease.release();')
				&& pool.includes('closeFreshConnections();'),
			disposesWarmSessionAfterFailure: pool.includes('if (!succeeded)')
				&& pool.includes('this.disposeTransferSession(reusableLease.session);')
		}, {
			smallJobsCanScaleWithoutBlockingStartup: true,
			usesWarmTaskSessionFirst: true,
			expandsWithoutWaitingForSpeculativeConnections: true,
			tracksAndBoundsPendingConnections: true,
			keepsWarmOnlyFallback: true,
			preservesCancellationAndCleanup: true,
			disposesWarmSessionAfterFailure: true
		});
	});

	test('runs ordinary SFTP work directly on the warmed task subsystem', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const withSftp = methodBlock(service, 'private async withSftp<T>', 'private async withDirectorySftp<T>');

		assert.deepStrictEqual({
			leasesWarmTaskSession: withSftp.includes('const lease = await this.acquireTransferSession(endpoint, progressId);'),
			reusesExistingSubsystem: withSftp.includes('await task(lease.session.sftp);'),
			doesNotOpenAnotherSubsystem: !withSftp.includes('this.openSftp('),
			preservesCancellation: withSftp.includes('this.registerTransferCancelHandler(progressId')
				&& withSftp.includes('this.abortDirectorySftpSessionAndWait(lease.session);'),
			discardsFailedSession: withSftp.includes('if (!succeeded)')
				&& withSftp.includes('this.disposeTransferSession(lease.session);'),
			releasesLease: withSftp.includes('lease.release();')
		}, {
			leasesWarmTaskSession: true,
			reusesExistingSubsystem: true,
			doesNotOpenAnotherSubsystem: true,
			preservesCancellation: true,
			discardsFailedSession: true,
			releasesLease: true
		});
	});

	test('keeps cancellable mutations off the shared browser SFTP subsystem', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const withDirectorySftp = methodBlock(service, 'private async withDirectorySftp<T>', 'private async withDirectorySshClient<T>');
		const withDirectorySsh = methodBlock(service, 'private async withDirectorySshClient<T>', 'private async withSshClient<T>');
		const closeTask = methodBlock(service, 'private async closeTaskSftpSession', 'private disposeTransferSession');

		assert.deepStrictEqual({
			cancellableSftpUsesTaskPool: withDirectorySftp.includes('? await this.acquireTransferSession(endpoint, progressId)')
				&& withDirectorySftp.includes('this.leaseDirectorySftpSession('),
			cancellableSshUsesTaskPool: withDirectorySsh.includes('? await this.acquireTransferSession(endpoint, progressId)')
				&& withDirectorySsh.includes('this.leaseDirectorySftpSession('),
			cancelDoesNotTearDownPaneTransport: closeTask.includes('this.removeTaskSftpSession(session)')
				&& !closeTask.includes('directorySftpSessions')
		}, {
			cancellableSftpUsesTaskPool: true,
			cancellableSshUsesTaskPool: true,
			cancelDoesNotTearDownPaneTransport: true
		});
	});

	test('verifies small SFTP results through the warm subsystem before shell fallback', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const verifyUpload = methodBlock(service, 'private async verifySshUploadSize', 'private async tryLocalToSshTarTransfer');
		const directSftp = methodBlock(service, 'private async tryDirectSftpTransferRoute', 'private async tryTunneledRsyncRelayTransfer');

		assert.ok(verifyUpload.includes('this.withDirectorySftp(target, async sftp => (await this.remoteStat(sftp, target.path)).size, progressId)'));
		assert.ok(verifyUpload.indexOf('this.withDirectorySftp(') < verifyUpload.indexOf('this.getRemotePathContentSizeByCommand('));
		assert.ok(directSftp.includes('this.withDirectorySftp(request.target, async sftp => (await this.remoteStat(sftp, request.target.path)).size, request.progressId)'));
		assert.ok(directSftp.indexOf('this.withDirectorySftp(') < directSftp.indexOf('this.getRemotePathSizeByCommand('));
	});

	test('keeps safe setup and credential cleanup off the direct transfer critical tail without weakening collision checks', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const directScp = methodBlock(service, 'private async tryDirectScpTransferRoute', 'private async prepareDirectTargetWithWarmSession');
		const directSftp = methodBlock(service, 'private async tryDirectSftpTransferRoute', 'private async tryTunneledRsyncRelayTransfer');
		const relay = methodBlock(service, 'private async tryStreamRelayTransfer', 'private async tryScpRelayTransfer');
		const credentialCleanup = methodBlock(service, 'private scheduleDirectProbeCredentialCleanup', 'private scheduleDirectScpProbeCleanup');
		const probeCleanup = methodBlock(service, 'private scheduleDirectScpProbeCleanup', 'private getCachedDirectScpProbeRoute');
		const credentialWrapper = methodBlock(service, 'function wrapRemoteCredentialCommand', 'function buildDirectScpProbeCommand');

		assert.deepStrictEqual({
			scpPreservesPortableCollisionPreparation: directScp.includes('buildPortablePosixRm(request.target.path, true)')
				&& !directScp.includes('buildPortablePosixMkdir(request.target.path)')
				&& directScp.includes('buildPortablePosixMkdir(targetParentPath)')
				&& directScp.includes('buildPortablePosixRm(request.target.path, false)')
				&& !directScp.includes('canSkipRemoteFileTargetPreparation'),
			sftpSkipsOnlyWhenParentListingIsFresh: directSftp.includes('this.hasFreshRemoteDirectoryListing(request.target, targetParentPath)')
				&& directSftp.includes('buildPortablePosixRm(request.target.path, true)')
				&& directSftp.includes('buildPortablePosixMkdir(request.target.path)')
				&& directSftp.includes('buildPortablePosixMkdir(targetParentPath)'),
			longTargetPreparationPrecedesCredentialSetup: directScp.indexOf('this.prepareDirectTargetWithWarmSession(') < directScp.indexOf('this.prepareRemoteScpCredential(')
				&& directSftp.indexOf('this.prepareDirectTargetWithWarmSession(') < directSftp.indexOf('this.prepareRemoteScpCredential('),
			sourcePushFallbackRetainsCredentialForTheDataCommand: directScp.includes('const retainedPreparation = wrapRemoteCredentialCommand(')
				&& directScp.includes('credential.activePath, true')
				&& directSftp.includes('const retainedPreparation = wrapRemoteCredentialCommand(')
				&& directSftp.includes('credential.activePath, true'),
			verificationStillRunsBeforeSuccess: directScp.includes('if (targetSize !== bytes)')
				&& directSftp.includes('if (targetSize !== bytes)')
				&& relay.includes('if (streamedBytes !== bytes)')
				&& !relay.includes('this.remoteStat(targetSftp, request.target.path)'),
			credentialCleanupTravelsWithDataCommand: directScp.includes('const scpCommand = wrapRemoteCredentialCommand(')
				&& directScp.includes('credential.cleanupCommand, credential.activePath);')
				&& directSftp.includes('const transferCommand = wrapRemoteCredentialCommand(')
				&& directSftp.includes('credential.cleanupCommand, credential.activePath);')
				&& credentialWrapper.includes('printf \'%s\\\\n\' "$$" > ${quotePosixShellArg(activePath)}')
				&& credentialWrapper.includes('0 HUP INT TERM'),
			cleanupReusesExistingSftpSubsystem: directScp.includes('this.scheduleDirectProbeCredentialCleanup(executorLease.session, credential.identityPath, credential.activePath);')
				&& directSftp.includes('this.scheduleDirectProbeCredentialCleanup(executorLease.session, credential.identityPath, credential.activePath);')
				&& credentialCleanup.includes('this.unlinkRemoteBestEffort(candidate.sftp, identityPath)')
				&& credentialCleanup.includes('activePath ? this.unlinkRemoteBestEffort(candidate.sftp, activePath) : Promise.resolve(true)')
				&& !credentialCleanup.includes('this.execRemote(')
				&& probeCleanup.includes('this.unlinkRemoteBestEffort(sourceSession.sftp, sourceProbePath)')
				&& probeCleanup.includes('this.unlinkRemoteBestEffort(targetSession.sftp, sourcePushTargetPath)')
				&& probeCleanup.includes('this.unlinkRemoteBestEffort(targetSession.sftp, targetPullTargetPath)')
				&& !probeCleanup.includes('this.execRemote('),
			relayProgressUsesLogicalFileBytes: relay.includes('const totalBytes = bytes;')
				&& relay.includes('Math.min(streamedBytes, totalBytes)')
				&& !relay.includes('streamedBytes * 2')
		}, {
			scpPreservesPortableCollisionPreparation: true,
			sftpSkipsOnlyWhenParentListingIsFresh: true,
			longTargetPreparationPrecedesCredentialSetup: true,
			sourcePushFallbackRetainsCredentialForTheDataCommand: true,
			verificationStillRunsBeforeSuccess: true,
			credentialCleanupTravelsWithDataCommand: true,
			cleanupReusesExistingSftpSubsystem: true,
			relayProgressUsesLogicalFileBytes: true
		});
	});
});
