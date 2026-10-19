/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

function methodBlock(source: string, name: string, nextName: string): string {
	const start = source.indexOf(name);
	assert.ok(start >= 0, `missing ${name}`);
	const end = source.indexOf(nextName, start);
	assert.ok(end > start, `missing ${nextName}`);
	return source.slice(start, end);
}

suite('TurboFileBatchStabilityStatic', () => {
	const servicePath = () => path.join(process.cwd(), 'src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts');

	test('only recursively inspects known directories and unknown tar selections', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const plain = methodBlock(service, 'private async runParallelLocalBatchTarUpload', 'private async runParallelLocalBatchTarZstdUpload');
		const zstd = methodBlock(service, 'private async runParallelLocalBatchTarZstdUpload', 'private async runParallelLocalTarUpload');

		for (const block of [plain, zstd]) {
			assert.ok(block.includes('plan.fileNames && plan.directoryNames && plan.unknownNames'));
			assert.ok(block.includes('plan.unknownNames, plan.directoryNames, plan.fileNames'));
		}
		const collector = methodBlock(service, 'private async collectLocalTarRelativeEntries', 'private localTarListEncodingPromise');
		assert.ok(collector.includes('entries.push(...knownFileNames.map(normalizeTarListPath))'));
		assert.ok(collector.includes('const directoryQueue = knownDirectoryNames.map(normalizeTarListPath)'));
		assert.ok(collector.includes('mapLimit(unknownNames'));
		assert.ok(collector.includes('active < LOCAL_DIRECTORY_STAT_CONCURRENCY'));
		assert.ok(collector.includes('directoryQueue.push(...subDirectories)'));
		assert.ok(!collector.includes('mapLimit(subDirectories'));
		assert.ok(collector.includes('Cannot archive Unix socket'));
	});

	test('keeps the established high-throughput tar stream ceiling bounded', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		assert.ok(service.includes('const LOCAL_PARALLEL_TAR_CHUNK_COUNT = 12;'));
	});

	test('reuses the warm SSH client only for strictly bounded small local SCP transfers', () => {
		const service = fs.readFileSync(servicePath(), 'utf8').replace(/\r\n/g, '\n');
		const scpUpload = methodBlock(service, 'private async runLocalScpUpload', 'private async runLocalScpDownload');
		const scpDownload = methodBlock(service, 'private async runLocalScpDownload', 'private async tryWarmLocalScpUpload');
		const warmScpUpload = methodBlock(service, 'private async tryWarmLocalScpUpload', 'private async tryWarmLocalScpDownload');
		const warmScpDownload = methodBlock(service, 'private async tryWarmLocalScpDownload', 'private async uploadPathWithNativeOpenSshScp');
		const scpUploadProtocol = methodBlock(service, 'private async uploadFileWithScpProtocolOnClient', 'private async downloadFileWithScpProtocol');
		const scpDownloadProtocol = methodBlock(service, 'private async downloadFileWithScpProtocolOnClient', 'private openScpExec');
		const openScp = methodBlock(service, 'private openScpExec', 'private async runLocalRsyncUpload');
		const directoryUpload = methodBlock(service, 'private async runLocalDirectoryTarUpload', 'private async runRemoteDirectoryTarDownload');
		const batchUpload = methodBlock(service, 'private async runLocalBatchTarUpload', 'private async runNativeLocalBatchTarUploadFromList');
		const candidate = methodBlock(service, 'private async isWarmLocalTarCandidate', 'private async runWarmLocalTarUpload');
		const warmTar = methodBlock(service, 'private async runWarmLocalTarUpload', 'private async runNativeLocalTarUpload');
		const openRemote = methodBlock(service, 'private openRemoteCommandStream', 'private transformImageBuffer');

		assert.deepStrictEqual({
			strictFileThreshold: service.includes('const LOCAL_WARM_SCP_MAX_BYTES = 8 * 1024 * 1024;')
				&& scpUpload.includes('localStat.size < LOCAL_WARM_SCP_MAX_BYTES')
				&& scpUpload.includes('tryWarmLocalScpUpload(request, localStat.size, onProgress)')
				&& scpDownload.includes("sourceType === 'file' && bytes < LOCAL_WARM_SCP_MAX_BYTES")
				&& scpDownload.includes('tryWarmLocalScpDownload(request, bytes, onProgress)'),
			strictTarThreshold: service.includes('const LOCAL_WARM_TAR_MAX_BYTES = 16 * 1024 * 1024;')
				&& candidate.includes('totalBytes >= LOCAL_WARM_TAR_MAX_BYTES'),
			strictWarmChannelBudget: service.includes('const WARM_TRANSFER_CHANNEL_OPEN_TIMEOUT_MS = 750;')
				&& warmTar.includes('WARM_TRANSFER_CHANNEL_OPEN_TIMEOUT_MS')
				&& warmScpUpload.includes('WARM_TRANSFER_CHANNEL_OPEN_TIMEOUT_MS')
				&& warmScpDownload.includes('WARM_TRANSFER_CHANNEL_OPEN_TIMEOUT_MS'),
			boundedDirectoryIteration: candidate.includes('fsp.opendir(fullDirectory)')
				&& candidate.includes('directory[Symbol.asyncIterator]()')
				&& candidate.includes('await awaitWithinScanBudget(frame.iterator.next())')
				&& candidate.includes('void frame.directory.close().catch(() => undefined);')
				&& candidate.includes('const directoryFrames: Array<')
				&& !candidate.includes('fsp.readdir('),
			boundedTarShape: candidate.includes('entryCount >= LOCAL_PARALLEL_TAR_MIN_ENTRIES')
				&& candidate.includes('return false;')
				&& !candidate.includes('collectLocalTarRelativeEntries('),
			warmScpDirectionsUseReadyClient: warmScpUpload.includes('this.acquireReadyTransferSession(request.target, request.progressId)')
				&& warmScpDownload.includes('this.acquireReadyTransferSession(request.source, request.progressId)')
				&& !warmScpUpload.includes('this.acquireTransferSession(')
				&& !warmScpDownload.includes('this.acquireTransferSession(')
				&& warmScpUpload.includes('lease.session.client')
				&& warmScpDownload.includes('lease.session.client')
				&& !warmScpUpload.includes('this.connect(')
				&& !warmScpDownload.includes('this.connect(')
				&& warmScpUpload.includes('scp -t')
				&& warmScpDownload.includes('scp -f'),
			warmTarUsesReadyClient: warmTar.includes('this.acquireReadyTransferSession(target, progressId)')
				&& !warmTar.includes('this.acquireTransferSession(')
				&& warmTar.includes('if (!lease)')
				&& warmTar.includes('lease.session.client')
				&& warmTar.includes("spawn('tar.exe'")
				&& !warmTar.includes("spawn(sshTool.executable"),
			hardTransportCancellation: scpUploadProtocol.includes('this.registerTransferCancelHandler(progressId, cancel)')
				&& scpDownloadProtocol.includes('this.registerTransferCancelHandler(progressId, cancel)')
				&& scpUploadProtocol.includes('abortSshExecStreamAndWait(stream)')
				&& scpDownloadProtocol.includes('abortSshExecStreamAndWait(stream)')
				&& scpUploadProtocol.includes('abortSshClientAndWait(client)')
				&& scpDownloadProtocol.includes('abortSshClientAndWait(client)')
				&& warmTar.includes('this.abortDirectorySftpSessionAndWait(lease.session)'),
			warmErrorsFallThrough: warmScpUpload.includes('return false;')
				&& warmScpDownload.includes('return false;')
				&& warmScpUpload.includes('shouldContinueTurboFileTransferPlan(classifyTurboFileTransferFailure(error))')
				&& warmScpDownload.includes('shouldContinueTurboFileTransferPlan(classifyTurboFileTransferFailure(error))')
				&& warmTar.includes('return false;'),
			channelOpenIsCancelable: openScp.includes('this.registerTransferCancelHandler(progressId')
				&& openRemote.includes('this.registerTransferCancelHandler(progressId')
				&& openScp.includes('new TurboFileTransferCanceledError()')
				&& openRemote.includes('new TurboFileTransferCanceledError()'),
			cancellationWinsAfterOpen: scpUploadProtocol.indexOf('stream = await this.openScpExec') < scpUploadProtocol.indexOf('this.throwIfTransferCanceled(progressId);', scpUploadProtocol.indexOf('stream = await this.openScpExec'))
				&& scpDownloadProtocol.indexOf('stream = await this.openScpExec') < scpDownloadProtocol.indexOf('this.throwIfTransferCanceled(progressId);', scpDownloadProtocol.indexOf('stream = await this.openScpExec'))
				&& warmTar.indexOf('remoteStream = await this.openRemoteCommandStream') < warmTar.indexOf('this.throwIfTransferCanceled(progressId);', warmTar.indexOf('remoteStream = await this.openRemoteCommandStream'))
				&& warmTar.indexOf('this.throwIfTransferCanceled(progressId);', warmTar.indexOf('remoteStream = await this.openRemoteCommandStream')) < warmTar.indexOf("spawn('tar.exe'"),
			lateChannelsAreDestroyed: /if \(settled\) \{[\s\S]*?stream\.destroy\(\)/.test(openScp)
				&& /if \(settled\) \{[\s\S]*?stream\.destroy\(\)/.test(openRemote)
				&& openScp.includes('stream.close?.()')
				&& openRemote.includes('stream.close?.()'),
			defaultChannelSemanticsRemain: openScp.includes('channelOpenTimeoutMs?: number')
				&& openRemote.includes('channelOpenTimeoutMs = REMOTE_EXEC_CHANNEL_OPEN_TIMEOUT_MS'),
			fixedScpSourceSnapshot: scpUploadProtocol.includes('end: totalBytes - 1')
				&& scpUploadProtocol.includes('if (totalBytes > 0)')
				&& scpUploadProtocol.includes('totalBytes >= maximumBytes')
				&& scpUploadProtocol.includes('if (transferredBytes !== totalBytes)')
				&& scpUploadProtocol.indexOf('if (transferredBytes !== totalBytes)') < scpUploadProtocol.indexOf('Buffer.from([0])'),
			boundedScpControlAndWrites: service.includes('const WARM_SCP_CONTROL_TIMEOUT_MS = 5 * 1000;')
				&& service.includes('const WARM_SCP_WRITE_INACTIVITY_TIMEOUT_MS = 10 * 1000;')
				&& warmScpUpload.includes('WARM_SCP_CONTROL_TIMEOUT_MS')
				&& warmScpUpload.includes('WARM_SCP_WRITE_INACTIVITY_TIMEOUT_MS')
				&& warmScpDownload.includes('WARM_SCP_CONTROL_TIMEOUT_MS')
				&& warmScpDownload.includes('WARM_SCP_WRITE_INACTIVITY_TIMEOUT_MS')
				&& scpUploadProtocol.includes('controlTimeoutMs')
				&& scpUploadProtocol.includes('writeInactivityTimeoutMs')
				&& scpDownloadProtocol.includes('controlTimeoutMs')
				&& scpDownloadProtocol.includes('dataInactivityTimeoutMs'),
			warmFailureKeepsNativeChain: scpUpload.indexOf('tryWarmLocalScpUpload') < scpUpload.indexOf('uploadPathWithNativeOpenSshScp')
				&& scpDownload.indexOf('tryWarmLocalScpDownload') < scpDownload.indexOf('downloadPathWithNativeOpenSshScp')
				&& directoryUpload.indexOf('runWarmLocalTarUpload') < directoryUpload.indexOf('runParallelLocalDirectoryTarUpload')
				&& batchUpload.indexOf('runWarmLocalTarUpload') < batchUpload.indexOf('runParallelLocalBatchTarUpload'),
			batchCleanupIsLengthGated: batchUpload.includes('isTurboFileBatchCommandSafe(warmRemoteCommand)')
				&& batchUpload.indexOf('isWarmLocalTarCandidate') < batchUpload.indexOf('const warmRemoteCommand = buildTarExtractToDirectoryCommand'),
			leafCompatibleTarCounting: candidate.includes('if (child.isDirectory())')
				&& candidate.includes('if (!await openDirectoryFrame(relativePath))')
				&& candidate.includes('if (!frame.hasChildren && frame.relativeDirectory && !countEntry())')
				&& candidate.indexOf('if (child.isDirectory())') < candidate.indexOf('if (!await inspectLeaf(relativePath))')
		}, {
			strictFileThreshold: true,
			strictTarThreshold: true,
			strictWarmChannelBudget: true,
			boundedDirectoryIteration: true,
			boundedTarShape: true,
			warmScpDirectionsUseReadyClient: true,
			warmTarUsesReadyClient: true,
			hardTransportCancellation: true,
			warmErrorsFallThrough: true,
			channelOpenIsCancelable: true,
			cancellationWinsAfterOpen: true,
			lateChannelsAreDestroyed: true,
			defaultChannelSemanticsRemain: true,
			fixedScpSourceSnapshot: true,
			boundedScpControlAndWrites: true,
			warmFailureKeepsNativeChain: true,
			batchCleanupIsLengthGated: true,
			leafCompatibleTarCounting: true
		});
	});

	test('bounds task SFTP opening and makes pending session acquisition cancelable', () => {
		const service = fs.readFileSync(servicePath(), 'utf8').replace(/\r\n/g, '\n');
		const acquire = methodBlock(service, 'private async acquireTransferSession', 'private acquireReadyTransferSession');
		const ready = methodBlock(service, 'private acquireReadyTransferSession', 'private async waitForTransferSession');
		const wait = methodBlock(service, 'private async waitForTransferSession', 'private leaseDirectorySftpSession');
		const acquirePair = methodBlock(service, 'private async acquireTransferSessionPair', 'private async abortDirectorySftpSessionAndWait');
		const leaseTask = methodBlock(service, 'private tryLeaseTaskSftpSession', 'private async waitForTransferSession');
		const closeTask = methodBlock(service, 'private async closeTaskSftpSession', 'private disposeTransferSession');
		const dispose = methodBlock(service, 'private disposeDirectorySftpSession', 'private getRemoteDirectoryListingCacheKey');
		const openSftp = methodBlock(service, 'private openSftp', 'private forwardIn');

		assert.deepStrictEqual({
			genericSftpOpenHasHardLimit: service.includes('const REMOTE_DIRECTORY_SFTP_OPEN_TIMEOUT_MS = 30 * 1000;')
				&& openSftp.includes('timeoutMs = REMOTE_DIRECTORY_SFTP_OPEN_TIMEOUT_MS')
				&& openSftp.includes("setTimeout(() => finish(() => reject(new Error('SFTP subsystem timed out while opening.'))), timeoutMs)"),
			lateSubsystemIsClosed: openSftp.includes('if (settled)')
				&& openSftp.includes('sftp?.end();')
				&& openSftp.includes('finish(() => reject(error));'),
			pendingTaskSessionWaitIsCancelable: acquire.includes('this.taskSftpPrewarmPending.get(key)')
				&& acquire.includes('await this.waitForTransferSession(pending, progressId)')
				&& acquire.includes('this.createTaskSftpSession(endpoint.connection, progressId)')
				&& wait.includes('this.registerTransferCancelHandler(progressId, () => settle(() => reject(new TurboFileTransferCanceledError())))')
				&& wait.includes('promise.then(value => settle(() => resolve(value)), error => settle(() => reject(error)))'),
			readyLookupNeverWaitsOrConnects: !ready.includes('await ')
				&& !ready.includes('ensureWarmDirectorySftpSession(')
				&& ready.includes('this.acquireReadyTaskSftpSession(endpoint.connection, progressId)'),
			taskCancelOwnsItsTransport: leaseTask.includes('this.closeTaskSftpSession(session)')
				&& closeTask.includes('this.removeTaskSftpSession(session)')
				&& !closeTask.includes('directorySftpSessions'),
			latePairedLeaseCannotLeakAfterCancellation: acquirePair.includes('let aborted = false;')
				&& acquirePair.includes('if (aborted)')
				&& acquirePair.includes('lease.release();')
				&& acquirePair.includes('aborted = true;')
				&& acquirePair.includes('sourceLease?.release();')
				&& acquirePair.includes('targetLease?.release();'),
			disposalForgetsTheReadySnapshot: dispose.includes('this.readyDirectorySftpSessions.get(key) === session')
				&& dispose.includes('this.readyDirectorySftpSessions.delete(key);')
		}, {
			genericSftpOpenHasHardLimit: true,
			lateSubsystemIsClosed: true,
			pendingTaskSessionWaitIsCancelable: true,
			readyLookupNeverWaitsOrConnects: true,
			taskCancelOwnsItsTransport: true,
			latePairedLeaseCannotLeakAfterCancellation: true,
			disposalForgetsTheReadySnapshot: true
		});
	});

	test('reuses completed target preparation but self-heals if undersized extraction fails', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const directoryParallel = methodBlock(service, 'private async runParallelLocalDirectoryTarUpload', 'private async runParallelLocalDirectoryTarZstdUpload');
		const batchParallel = methodBlock(service, 'private async runParallelLocalBatchTarUpload', 'private async runParallelLocalBatchTarZstdUpload');
		const directoryUpload = methodBlock(service, 'private async runLocalDirectoryTarUpload', 'private async runRemoteDirectoryTarDownload');
		const batchUpload = methodBlock(service, 'private async runLocalBatchTarUpload', 'private async runNativeLocalBatchTarUploadFromList');

		for (const parallel of [directoryParallel, batchParallel]) {
			assert.ok(parallel.includes('Promise<LocalParallelTarUploadResult>'));
			assert.match(parallel, /if \(entries.length < LOCAL_PARALLEL_TAR_MIN_ENTRIES\) \{\s+await preparePromise;\s+return 'insufficient-entries';\s+\}/);
			assert.ok(!parallel.includes('Not enough entries for parallel'));
		}
		assert.match(directoryUpload, /if \(parallelResult === 'insufficient-entries'\) \{[\s\S]*?runNativeLocalTarUpload\([\s\S]*?buildTarExtractStreamToDirectoryCommand[\s\S]*?return;[\s\S]*?\}/);
		assert.match(batchUpload, /if \(parallelResult === 'insufficient-entries'\) \{[\s\S]*?runNativeLocalBatchTarUploadFromList\([\s\S]*?buildTarExtractStreamToDirectoryCommand[\s\S]*?return;[\s\S]*?\}/);
		for (const upload of [directoryUpload, batchUpload]) {
			const insufficientIndex = upload.indexOf("if (parallelResult === 'insufficient-entries')");
			const zstdIndex = upload.indexOf('TarZstdUpload');
			assert.ok(insufficientIndex >= 0 && insufficientIndex < zstdIndex);
			assert.ok(!upload.includes('if (reusePreparedTarget)'));
		}
	});

	test('includes credential activity wrapper overhead in the direct batch tar command limit', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const directBatchTar = methodBlock(service, 'private async tryDirectBatchTarTransferRoute', 'private async tryRelayBatchTarTransfer');

		assert.ok(directBatchTar.includes('const wrappedSizingCommand = wrapRemoteCredentialCommand(sizingCommand, sizingCleanupCommand, sizingActivePath);')
			&& directBatchTar.includes('const usePreparedTarget = !isTurboFileBatchCommandSafe(wrappedSizingCommand);')
			&& !directBatchTar.includes('const usePreparedTarget = !isTurboFileBatchCommandSafe(sizingCommand);')
			&& directBatchTar.indexOf('const wrappedSizingCommand =') < directBatchTar.indexOf('const usePreparedTarget ='));
	});

	test('uses the SCP wire protocol in both warm directions without borrowing the pane SFTP subsystem', () => {
		const service = fs.readFileSync(servicePath(), 'utf8').replace(/\r\n/g, '\n');
		const warmUpload = methodBlock(service, 'private async tryWarmLocalScpUpload', 'private async tryWarmLocalScpDownload');
		const warmDownload = methodBlock(service, 'private async tryWarmLocalScpDownload', 'private async uploadPathWithNativeOpenSshScp');
		const uploadProtocol = methodBlock(service, 'private async uploadFileWithScpProtocolOnClient', 'private async downloadFileWithScpProtocol');
		const downloadProtocol = methodBlock(service, 'private async downloadFileWithScpProtocolOnClient', 'private openScpExec');
		const standaloneUpload = methodBlock(service, 'private async uploadFileWithScpProtocol', 'private async uploadFileWithScpProtocolOnClient');
		const standaloneDownload = methodBlock(service, 'private async downloadFileWithScpProtocol', 'private async downloadFileWithScpProtocolOnClient');
		const openScp = methodBlock(service, 'private openScpExec', 'private async runLocalRsyncUpload');
		const scpReader = methodBlock(service, 'class ScpProtocolReader', 'async function readScpResponse');
		const writeScp = methodBlock(service, 'function writeScpData', 'function waitForScpClose');
		const waitScpClose = methodBlock(service, 'function waitForScpClose', 'function formatScpMode');
		const uploadRemoteClose = uploadProtocol.indexOf("await waitForStage(closePromise, controlTimeoutMs, 'remote close');");
		const uploadPostCloseCancellation = uploadProtocol.indexOf('this.throwIfTransferCanceled(progressId);', uploadRemoteClose);

		assert.deepStrictEqual({
			bothDirectionsUseScpWire: warmUpload.includes('this.uploadFileWithScpProtocolOnClient(lease.session.client')
				&& warmUpload.includes('&& scp -t')
				&& warmDownload.includes('this.downloadFileWithScpProtocolOnClient(lease.session.client')
				&& warmDownload.includes('exec scp -f'),
			noWarmSftpFastPut: !warmUpload.includes('fastPut')
				&& !warmDownload.includes('fastGet')
				&& !warmUpload.includes('.sftp')
				&& !warmDownload.includes('.sftp')
				&& !service.includes('private openWarmTransferSftp'),
			portableUploadReplacement: warmUpload.includes('const tempTargetPath = `${request.target.path}.turbofile-scp-${randomUUID()}.part`;')
				&& warmUpload.includes('const nestedTempPath = joinRemotePath(request.target.path, getTransferName(tempTargetPath));')
				&& warmUpload.includes('buildPortablePosixRm(tempTargetPath, false)')
				&& warmUpload.includes('buildPortablePosixMkdir(targetParentPath)')
				&& warmUpload.includes("trap ${quotePosixShellArg(cleanupTemp)} 0 1 2 15")
				&& warmUpload.includes('mv -fT ${quotePortablePosixOperand(tempTargetPath)} ${quotedTarget}')
				&& warmUpload.includes('WARM_SCP_TARGET_DIRECTORY_CONFLICT_MARKER')
				&& warmUpload.includes("printf '\\\\001%s\\\\n'")
				&& warmUpload.includes('error.message.includes(WARM_SCP_TARGET_DIRECTORY_CONFLICT_MARKER)')
				&& warmUpload.includes('this.rememberRemoteDirectory(request.target.connection, targetParentPath);'),
			busyBoxPortableCommitFallback: warmUpload.includes('const portableCommitTemp = `if ! mv -f ${quotePortablePosixOperand(tempTargetPath)} ${quotedTarget};')
				&& warmUpload.includes('then ${ensureTargetIsNotDirectory}; ${portableCommitTemp}; fi`;'),
			commitFailureStopsFallback: service.includes("const WARM_SCP_COMMIT_FAILED_MARKER = 'TURBOFILE_SCP_COMMIT_FAILED';")
				&& warmUpload.includes('const commitFailedMessage = `${WARM_SCP_COMMIT_FAILED_MARKER}: remote target commit failed`;')
				&& warmUpload.includes("const commitFailed = `printf '%s\\\\n' ${quotePosixShellArg(commitFailedMessage)} >&2; exit 74`;")
				&& warmUpload.includes('error.message.includes(WARM_SCP_COMMIT_FAILED_MARKER)'),
			directoryRaceIsGuardedAndCleaned: warmUpload.includes('if [ -d ${quotedTarget} ]; then ${buildPortablePosixRm(nestedTempPath, false)}; fi')
				&& (warmUpload.match(/\$\{ensureTargetIsNotDirectory\}/g)?.length ?? 0) === 4
				&& warmUpload.includes('if [ -d ${quotedTarget} ]; then ${directoryConflict}; fi; ${commitFailed}; fi`'),
			warmUploadDoesNotPreDeleteTarget: !warmUpload.includes('buildPortablePosixRm(request.target.path')
				&& !warmUpload.includes('unlinkRemote(')
				&& !warmUpload.includes('fsp.rm(request.target.path'),
			warmClientIsOnlyLeased: warmUpload.includes('lease?.release();')
				&& warmDownload.includes('lease?.release();')
				&& !warmUpload.includes('lease.session.client.end()')
				&& !warmDownload.includes('lease.session.client.end()'),
			standaloneFallbacksReuseTheSameWireHelpers: standaloneUpload.includes('this.downloadFileWithScpProtocolOnClient') === false
				&& standaloneUpload.includes('this.connect(configResult.config, progressId)')
				&& standaloneUpload.includes('this.uploadFileWithScpProtocolOnClient(client')
				&& standaloneDownload.includes('this.connect(configResult.config, progressId)')
				&& standaloneDownload.includes('this.downloadFileWithScpProtocolOnClient(client'),
			channelCancellationAndTimeoutsAreSymmetric: uploadProtocol.includes('this.registerTransferCancelHandler(progressId, cancel)')
				&& downloadProtocol.includes('this.registerTransferCancelHandler(progressId, cancel)')
				&& uploadProtocol.includes('abortSshClientAndWait(client)')
				&& downloadProtocol.includes('abortSshClientAndWait(client)')
				&& uploadProtocol.includes('channelOpenTimeoutMs')
				&& downloadProtocol.includes('channelOpenTimeoutMs')
				&& uploadProtocol.includes('controlTimeoutMs')
				&& downloadProtocol.includes('controlTimeoutMs')
				&& downloadProtocol.includes('dataInactivityTimeoutMs')
				&& uploadProtocol.includes('void closePromise.catch(() => undefined);')
				&& uploadProtocol.includes("await waitForStage(closePromise, controlTimeoutMs, 'failed upload remote close');")
				&& uploadProtocol.includes('throw closeError;')
				&& downloadProtocol.includes('void closePromise.catch(() => undefined);')
				&& writeScp.includes("stream.once('close', onClose);")
				&& writeScp.includes('SCP stream closed while waiting for write backpressure.')
				&& openScp.includes('SCP_EXEC_DIAGNOSTICS.set(stream, diagnostics);')
				&& scpReader.includes('const stderr = SCP_EXEC_DIAGNOSTICS.get(stream)?.stderr.trim();')
				&& scpReader.includes('this.streamError = new Error(stderr);')
				&& waitScpClose.includes('SCP_EXEC_DIAGNOSTICS.get(stream)?.stderr.trim()')
				&& waitScpClose.includes('stderr || `SCP command failed with exit code ${code}.`')
				&& waitScpClose.includes('code === 0 || (code === null && !stderr)')
				&& uploadRemoteClose >= 0
				&& uploadPostCloseCancellation > uploadRemoteClose
				&& uploadPostCloseCancellation < uploadProtocol.indexOf('completed = true;'),
			downloadIsAtomicAndCleansFailures: downloadProtocol.includes('const tempPath = `${localPath}.turbofile-scp-${randomUUID()}.part`;')
				&& downloadProtocol.includes("output = await fsp.open(tempPath, 'wx', 0o600);")
				&& downloadProtocol.includes('const result = await output!.write(chunk, written, chunk.byteLength - written, null);')
				&& downloadProtocol.includes('await output!.close();')
				&& downloadProtocol.includes('await fsp.rename(tempPath, localPath);')
				&& !downloadProtocol.includes('fsp.rm(localPath')
				&& downloadProtocol.includes('if (!completed)')
				&& downloadProtocol.includes('await fsp.rm(tempPath, { force: true }).catch(() => undefined);')
				&& downloadProtocol.indexOf('await output?.close().catch(() => undefined);') < downloadProtocol.indexOf('await fsp.rm(tempPath, { force: true }).catch(() => undefined);'),
			downloadProgressAndBoundsArePreserved: downloadProtocol.includes('this.markTransferDataStarted(progressId);')
				&& downloadProtocol.includes('onProgress?.(transferredBytes);')
				&& downloadProtocol.includes('header.size >= maximumBytes')
				&& downloadProtocol.includes('SCP download stalled without data progress.')
				&& service.includes('constructor(stream: ISSHExecStream, onData?: () => void)')
		}, {
			bothDirectionsUseScpWire: true,
			noWarmSftpFastPut: true,
			portableUploadReplacement: true,
			busyBoxPortableCommitFallback: true,
			commitFailureStopsFallback: true,
			directoryRaceIsGuardedAndCleaned: true,
			warmUploadDoesNotPreDeleteTarget: true,
			warmClientIsOnlyLeased: true,
			standaloneFallbacksReuseTheSameWireHelpers: true,
			channelCancellationAndTimeoutsAreSymmetric: true,
			downloadIsAtomicAndCleansFailures: true,
			downloadProgressAndBoundsArePreserved: true
		});
	});

	test('hard-bounds warm tar discovery and warm tar inactivity only', () => {
		const service = fs.readFileSync(servicePath(), 'utf8').replace(/\r\n/g, '\n');
		const candidate = methodBlock(service, 'private async isWarmLocalTarCandidate', 'private async runWarmLocalTarUpload');
		const warmTar = methodBlock(service, 'private async runWarmLocalTarUpload', 'private async runNativeLocalTarUpload');
		const warmCharset = methodBlock(service, 'private async getWarmLocalTarCharsetArgs', 'private async createLocalTarListBuffer');

		assert.deepStrictEqual({
			twentyFiveMillisecondBudget: service.includes('const LOCAL_WARM_TAR_SCAN_BUDGET_MS = 25;')
				&& candidate.includes('const scanBudgetDeadline = Date.now() + LOCAL_WARM_TAR_SCAN_BUDGET_MS;')
				&& candidate.includes('Promise.race')
				&& candidate.includes('scanBudgetExceeded'),
			sixtyFourDirectoryLimit: service.includes('const LOCAL_WARM_TAR_MAX_VISITED_DIRECTORIES = 64;')
				&& candidate.includes('visitedDirectoryCount >= LOCAL_WARM_TAR_MAX_VISITED_DIRECTORIES')
				&& candidate.includes('visitedDirectoryCount++;'),
			lateDirectoryHandleCloses: candidate.includes('void operation.then(value => disposeLate?.(value)')
				&& candidate.includes('directory => void directory.close().catch(() => undefined)'),
			warmTarUsesResettableInactivity: warmTar.includes('WARM_TRANSFER_INACTIVITY_TIMEOUT_MS')
				&& warmTar.includes('resetInactivityWatchdog()')
				&& warmTar.includes('createProgressPassThrough(delta =>')
				&& warmTar.includes('Promise.race')
				&& warmTar.includes('abort();')
				&& !warmTar.includes('WARM_TRANSFER_TOTAL_TIMEOUT'),
			warmTarCancellationSettlesImmediately: warmTar.includes('let transferFailureSettled = false;')
				&& warmTar.includes('failTransfer(new TurboFileTransferCanceledError());')
				&& warmTar.indexOf('failTransfer(new TurboFileTransferCanceledError());') < warmTar.indexOf('abort();', warmTar.indexOf('failTransfer(new TurboFileTransferCanceledError());')),
			charsetDetectionIsBoundedBeforeRemoteChannel: service.includes('const LOCAL_TAR_CHARSET_DETECTION_TIMEOUT_MS = 1000;')
				&& service.includes('const LOCAL_WARM_TAR_CHARSET_WAIT_MS = 10;')
				&& service.includes("execFile('tar.exe', ['--version'], { windowsHide: true, timeout: LOCAL_TAR_CHARSET_DETECTION_TIMEOUT_MS }")
				&& service.includes('void this.getLocalTarCharsetArgs();')
				&& service.includes('this.localTarCharsetArgsPromise = undefined;')
				&& warmCharset.includes('Promise.race')
				&& warmCharset.includes("resolve(['--options', 'hdrcharset=UTF-8'])")
				&& warmTar.includes('const localTarCharsetArgs = await runWithInactivityWatchdog(() => this.getWarmLocalTarCharsetArgs());')
				&& warmTar.indexOf('const localTarCharsetArgs =') < warmTar.indexOf('remoteStream = await this.openRemoteCommandStream')
				&& warmTar.includes("spawn('tar.exe', [...localTarCharsetArgs, ...tarArgs]")
		}, {
			twentyFiveMillisecondBudget: true,
			sixtyFourDirectoryLimit: true,
			lateDirectoryHandleCloses: true,
			warmTarUsesResettableInactivity: true,
			warmTarCancellationSettlesImmediately: true,
			charsetDetectionIsBoundedBeforeRemoteChannel: true
		});
	});

	test('cleans full target paths with BusyBox-portable operands and one null-delimited xargs process', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const prepare = methodBlock(service, 'private async prepareRemoteBatchTarTarget', 'private async runNativeLocalTarUploadChunk');
		const builder = methodBlock(service, 'function buildPrepareTarExtractToDirectoryFromListCommand', 'function buildTarSourcePushCommand');
		const portableOperand = methodBlock(service, 'function quotePortablePosixOperand', 'function buildPortablePosixMkdir');
		const portableMkdir = methodBlock(service, 'function buildPortablePosixMkdir', 'function buildPortablePosixRm');
		const portableRm = methodBlock(service, 'function buildPortablePosixRm', 'function buildPortablePosixRmMany');
		const portableRmMany = methodBlock(service, 'function buildPortablePosixRmMany', 'function normalizeTransferDependencies');

		assert.ok(prepare.includes('targetNames.map(name => joinRemotePath(targetDirectory, name))'));
		assert.ok(portableOperand.includes("value.startsWith('-') ? `./${value}` : value"));
		assert.ok(portableMkdir.includes("return `mkdir -p ${quotePortablePosixOperand(path)}`;"));
		assert.ok(portableRm.includes("return `rm ${recursive ? '-rf' : '-f'} ${quotePortablePosixOperand(path)}`;"));
		assert.ok(portableRmMany.includes("paths.map(quotePortablePosixOperand).join(' ')"));
		assert.ok(builder.includes('buildPortablePosixMkdir(targetDirectory)'));
		assert.ok(builder.includes('LC_ALL=C xargs -0 -r rm -rf'));
		assert.ok(!builder.includes('LC_ALL=C xargs -0 -r rm -rf --'));
		assert.ok(builder.includes('return `sh -c ${quotePosixShellArg(commands.join(\'; \'))}`;'));
		assert.ok(!builder.includes('bash -lc'));
		assert.ok(!builder.includes('while IFS= read'));
	});

	test('aggregates fallback progress incrementally without forced per-item IPC', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const concurrent = methodBlock(service, 'private async runConcurrentBatchTransfer', 'private fireBatchAggregateProgress');
		const aggregate = methodBlock(service, 'private fireBatchAggregateProgress', 'private async deleteBatchSources');

		assert.ok(concurrent.includes('let aggregateTransferredBytes'));
		assert.ok(concurrent.includes('let aggregateTotalBytes'));
		assert.ok(!aggregate.includes('.reduce('));
		assert.ok(!concurrent.includes("'Batch transfer in progress.', completedItems, items.length, item.displayName ?? item.targetName, true"));
	});

	test('never removes move sources after a partially successful batch', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const concurrent = methodBlock(service, 'private async runConcurrentBatchTransfer', 'private fireBatchAggregateProgress');

		assert.ok(concurrent.includes("operation === 'move' && failures.length === 0 && successfulItems.length === items.length"));
		assert.ok(!concurrent.includes("operation === 'move' && successfulItems.length"));
	});

	test('streams explicit rsync source lists instead of appending paths to commands', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const local = methodBlock(service, 'private async tryLocalBatchRsyncTransfer', 'private async tryDirectBatchRsyncTransfer');
		const direct = methodBlock(service, 'private async tryDirectBatchRsyncTransferRoute', 'private async tryTunneledBatchRsyncRelayTransfer');
		const relay = methodBlock(service, 'private async tryTunneledBatchRsyncRelayTransfer', 'private async tryBatchTarTransfer');

		for (const transfer of [local, direct, relay]) {
			assert.ok(transfer.includes("'--files-from=-'"));
			assert.ok(transfer.includes("'--from0'"));
			assert.ok(transfer.includes('input:'));
		}
		assert.ok(!local.includes('const sourceArgs = items.map'));
		assert.ok(!direct.includes('const sourceArgs = items.map'));
		assert.ok(!relay.includes('const sourceArgs = items.map'));
	});

	test('limits reverse rsync workers and streams cleanup paths', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const single = methodBlock(service, 'async tryLocalToSshReverseParallelRsyncUpload', 'private async createLocalWindowsReverseRsyncItems');
		const batch = methodBlock(service, 'async tryLocalToSshReverseParallelRsyncBatchUpload', 'private async resolveLocalWindowsRsyncSourceConnection');
		const builder = methodBlock(service, 'function buildLocalWindowsReverseParallelRsyncCommand', 'function buildLocalWindowsReverseParallelRsyncInput');
		const input = methodBlock(service, 'function buildLocalWindowsReverseParallelRsyncInput', 'function getLocalWindowsRsyncConfigPaths');

		for (const transfer of [single, batch]) {
			assert.ok(transfer.includes('input,'));
		}
		assert.ok(builder.includes('TURBOFILE_REVERSE_RSYNC_WORKERS'));
		assert.ok(builder.includes("read -r -d \\'\\'"));
		assert.ok(builder.includes('--files-from='));
		assert.ok(input.includes('createTurboFileRsyncMappedGroups'));
		assert.ok(input.includes("records.push('C'"));
		assert.ok(input.includes('String(items.length + groupIndex)'));
	});

	test('keeps reverse rsync progress aggregation constant-time and preserves renamed targets', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const progress = methodBlock(service, 'private createParallelRsyncProgressReporter', 'private beginTransferGrowthTiming');
		const builder = methodBlock(service, 'function buildLocalWindowsReverseParallelRsyncCommand', 'function buildLocalWindowsReverseParallelRsyncInput');

		assert.ok(progress.includes('aggregateTransferredBytes += nextBytes - previousBytes'));
		assert.ok(progress.includes('aggregateSpeedBytesPerSecond += snapshot.speedBytesPerSecond - previousSpeed'));
		assert.ok(!progress.includes('Array.from(transferredByIndex.values()).reduce'));
		assert.ok(!progress.includes('Array.from(speedByIndex.values()).reduce'));
		assert.ok(builder.includes('staging_path=$(mktemp -d'));
		assert.ok(builder.includes('mv -n -- "$staged_source" "$target_path"'));
		assert.ok(builder.includes('then status=74'));
	});

	test('allows long rsync startup scans without changing transfer stream settings', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const direct = methodBlock(service, 'private async tryDirectBatchRsyncTransferRoute', 'private async tryTunneledBatchRsyncRelayTransfer');
		const relay = methodBlock(service, 'private async tryTunneledBatchRsyncRelayTransfer', 'private async tryBatchTarTransfer');

		assert.ok(service.includes('const DIRECT_RSYNC_STALL_TIMEOUT_MS = 10 * 60 * 1000;'));
		for (const transfer of [direct, relay]) {
			assert.ok(transfer.includes('inactivityTimeoutMs: DIRECT_RSYNC_STALL_TIMEOUT_MS'));
			assert.ok(transfer.includes('progressId: request.progressId'));
		}
	});

	test('does not serially stat known reverse rsync batch item types', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const batch = methodBlock(service, 'async tryLocalToSshReverseParallelRsyncBatchUpload', 'private async resolveLocalWindowsRsyncSourceConnection');

		assert.ok(batch.includes('item.sourceType'));
		assert.ok(batch.includes('mapLimit('));
		assert.ok(!batch.includes('for (const item of batchItems) {\n\t\t\t\tconst stat = await fsp.stat'));
	});

	test('keeps symlinks in reverse rsync splits and falls back for special entries', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const reader = methodBlock(service, 'private async readLocalRsyncSplitEntries', 'async tryLocalToSshReverseParallelRsyncBatchUpload');

		assert.ok(reader.includes('entry.isSymbolicLink()'));
		assert.ok(reader.includes('return [];'));
		assert.ok(!reader.includes('.filter(entry => entry.isDirectory() || entry.isFile())'));
	});

	test('does not force a progress IPC after every local copied item', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const local = methodBlock(service, 'private async runLocalNativeBatchTransfer', 'private async runSameRemoteNativeBatchTransfer');

		assert.ok(local.includes('index === 0'));
		assert.ok(!local.includes("'Copying locally.', true, {\n\t\t\t\t\tcompletedItems: index + 1"));
	});

	test('coalesces throttled progress and schedules the latest value for delivery', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const progress = methodBlock(service, 'private fireTransferProgress', 'private getTransferProgressEmitter');

		assert.ok(progress.includes('this.pendingTransferProgress.set(progressId'));
		assert.ok(progress.includes('setTimeout(() =>'));
		assert.ok(progress.includes('this.fireTransferProgress(pending.request, pending.transferredBytes'));
		assert.ok(progress.includes('clearTimeout(pendingTimer)'));
	});

	test('streams large local POSIX move selections through stdin', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const local = methodBlock(service, 'private async runLocalNativeBatchTransfer', 'private async runSameRemoteNativeBatchTransfer');

		assert.ok(local.includes('createPosixNativeBatchTransferPlan'));
		assert.ok(local.includes('input: plan.input'));
		assert.ok(!local.includes("runLocalCommand('mv', ['-f', ...sources"));
	});

	test('forwards cross-volume move byte deltas without changing rename or rollback', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const batch = methodBlock(service, 'private async runLocalNativeBatchTransfer', 'private async runSameRemoteNativeBatchTransfer');
		const move = methodBlock(service, 'private async moveLocalPathNative', 'private async rollbackLocalMoves');
		assert.deepStrictEqual({
			batchCollectsDeltas: batch.includes('this.moveLocalPathNative(item.sourcePath, targetPath, request.progressId, delta =>'),
			copyPreservesProgress: move.includes('this.copyLocalPath(sourcePath, targetPath, onDelta, progressId)'),
			renamePreserved: move.includes('await fsp.rename(sourcePath, targetPath)'),
			rollbackPreserved: batch.includes('await this.rollbackLocalMoves(completedMoves)')
		}, { batchCollectsDeltas: true, copyPreservesProgress: true, renamePreserved: true, rollbackPreserved: true });
	});

	test('does not treat the last remote copy sample as the completed directory size', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const copy = methodBlock(service, 'private async trySameRemoteCopy', 'private async tryDirectTarTransfer');
		assert.deepStrictEqual({
			keepsKnownBytes: copy.includes('const expectedBytes = Math.max(0, request.expectedBytes ?? 0)'),
			resolvesUnknownTotalAfterCopy: copy.indexOf('await this.getRemotePathContentSizeByCommand(request.target, request.progressId)') > copy.indexOf('await this.runRemoteMutationWithSftpFallback('),
			returnsFinalBytes: copy.includes("this.createTransferResult(true, 'remote-copy', resultBytes")
		}, { keepsKnownBytes: true, resolvesUnknownTotalAfterCopy: true, returnsFinalBytes: true });
	});

	test('bounds native batch probes and discards in-flight samples after stop', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const monitor = methodBlock(service, 'private async monitorRemoteBatchNativeCopy', 'private async tryLocalBatchRsyncTransfer');
		const growth = methodBlock(service, 'private beginTransferGrowthTiming', 'private normalizeGrowthProgressBytes');
		const probe = growth.indexOf('const size = await probeSize();');
		assert.deepStrictEqual({
			boundedProbes: monitor.includes('mapLimit(items, 1,'),
			noCompletionSleep: !monitor.includes('await delay('),
			awaitsOperation: monitor.includes('await operation();'),
			stopsObserver: monitor.includes('stop();'),
			discardsLateSample: growth.indexOf('if (stopped)', probe) < growth.indexOf('onProgress?.(transferredBytes)', probe)
		}, { boundedProbes: true, noCompletionSleep: true, awaitsOperation: true, stopsObserver: true, discardsLateSample: true });
	});

	test('keeps native directory SCP progress probes coarse and active in both directions', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const upload = methodBlock(service, 'private async uploadPathWithNativeOpenSshScp', 'private async downloadPathWithNativeOpenSshScp');
		const download = methodBlock(service, 'private async downloadPathWithNativeOpenSshScp', 'private async uploadFileWithScpProtocol');
		assert.deepStrictEqual({
			remoteDirectoryProbe: upload.includes('this.beginRemotePathGrowthTiming(')
				&& upload.includes('onProgress, 1000, 500, reportActivity)'),
			localDirectoryProbe: download.includes('getLocalPathSize(localPath)')
				&& download.includes('onProgress, 1000, 500, 1000, reportActivity)'),
			cleanup: [upload, download].every(block => block.includes('stopGrowthTiming();')),
			keepsNativeScp: [upload, download].every(block => block.includes("this.runCancelableLocalCommand('scp.exe'"))
		}, { remoteDirectoryProbe: true, localDirectoryProbe: true, cleanup: true, keepsNativeScp: true });
	});
});
