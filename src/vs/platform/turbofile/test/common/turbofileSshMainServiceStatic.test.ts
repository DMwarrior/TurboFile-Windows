/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

function methodBlock(source: string, name: string, nextName: string): string {
	const start = source.indexOf(name);
	return source.slice(start, source.indexOf(nextName, start)).replace(/\r\n/g, '\n');
}

function functionBlock(source: string, name: string): string {
	const start = source.indexOf(`function ${name}`);
	assert.ok(start >= 0, `missing function ${name}`);
	const end = source.indexOf('\nfunction ', start + 1);
	return source.slice(start, end === -1 ? source.length : end).replace(/\r\n/g, '\n');
}

function numericProductConstant(source: string, name: string): number {
	const match = new RegExp(`const ${name} = ([0-9 *]+);`).exec(source);
	assert.ok(match, `missing numeric constant ${name}`);
	return match[1].split('*').reduce((product, factor) => product * Number(factor.trim()), 1);
}

suite('TurboFileSshMainServiceStatic', () => {
	const servicePath = () => path.join(process.cwd(), 'src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts');
	const batchTransferFlowPath = () => path.join(process.cwd(), 'src/vs/platform/turbofile/common/turbofileBatchTransferFlow.ts');

	test('registers Windows drag support without terminating or relaunching the shell', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const registration = methodBlock(service, 'private async registerWindowsDragCopyHook', 'private resolveWindowsDragCopyHookDllPath');
		const resolution = methodBlock(service, 'private resolveWindowsDragCopyHookDllPath', 'async readFile');

		assert.deepStrictEqual({
			notifiesShell: registration.includes('createWindowsShellAssociationChangedScript()'),
			usesInstalledVersion: resolution.includes("join(dirname(app.getPath('exe')), 'shell', 'drag-ext', app.getVersion(), 'x64', 'TurboFileDragExt.dll')"),
			terminatesShell: /(?:taskkill|Stop-Process)[^\r\n]*explorer/i.test(service),
			restartsShell: service.includes('restartWindowsExplorer') || service.includes('Start-Process explorer.exe')
		}, {
			notifiesShell: true,
			usesInstalledVersion: true,
			terminatesShell: false,
			restartsShell: false
		});
	});

	test('keeps remote directory retries and cache generations safe', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const listCoreIndex = service.indexOf('private async listRemoteDirectoryCore');
		const listCoreEnd = service.indexOf('private createRemoteDirectoryListingResult', listCoreIndex);
		const block = service.slice(listCoreIndex, listCoreEnd);

		assert.ok(listCoreIndex >= 0);
		assert.ok(block.includes('REMOTE_DIRECTORY_READ_MAX_ATTEMPTS'));
		assert.ok(block.includes('getRemoteDirectoryReadRetryDelay(attempt)'));
		assert.ok(block.includes('this.remoteDirectoryListingGenerations.isCurrent'));
	});

	test('starts top-level transfers immediately while retaining adaptive in-batch workers', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const transferFile = methodBlock(service, 'async transferFile', 'private async transferFileCore');
		const transferBatch = methodBlock(service, 'async transferBatch', 'private async transferBatchCore');
		const concurrentBatch = methodBlock(service, 'private async runConcurrentBatchTransfer', 'private fireBatchAggregateProgress');
		const uploadVerification = methodBlock(service, 'private async verifySshUploadSize', 'private async tryLocalToSshTarTransfer');
		const deletePathsCore = methodBlock(service, 'private async deletePathsCore', 'private async deleteRemotePathNative');

		assert.ok(!service.includes("from '../common/turbofileOperationQueue.js'"));
		assert.ok(!service.includes('fileOperationQueue'));
		assert.ok(!service.includes('Waiting for device operation queue.'));
		assert.ok(!service.includes('function getTransferOperationAccess('));
		assert.ok(service.includes('function getFileOperationDeviceKey('));
		assert.ok(service.includes("return 'local';"));
		assert.ok(service.includes('connection.username'));
		assert.ok(service.includes('connection.host'));
		assert.ok(service.includes('connection.port'));
		assert.ok(service.includes('function getBatchTransferSchedulingSnapshot('));
		assert.ok(service.includes("initialAttempt?.protocol === 'scp' || initialAttempt?.protocol === 'sftp'"));
		assert.ok(service.includes('const workerLimit = usesConcurrentWorkers ? maximumWorkers : 1;'));

		assert.match(transferFile, /\b(?:const|let) result = await this\.transferFileCore\(request\);/);
		assert.ok(!transferFile.includes('runWithAccess'));
		assert.ok(transferBatch.includes('const scheduling = getBatchTransferSchedulingSnapshot(request, items, this.transferScheduler);'));
		assert.ok(transferBatch.includes('schedulerConcurrency: scheduling.workerLimit'));
		assert.match(transferBatch, /\b(?:const|let) result = await this\.transferBatchCore\(scheduledRequest\);/);
		assert.ok(!transferBatch.includes('runWithAccess'));

		assert.ok(concurrentBatch.includes('this.transferFileCore({'));
		assert.ok(!concurrentBatch.includes('this.transferFile({'));
		assert.ok(concurrentBatch.includes('request.schedulerConcurrency ?? 1'));
		assert.ok(!uploadVerification.includes('this.deletePathCore('));
		assert.ok(uploadVerification.includes('targetStat?.isDirectory()'));
		assert.ok(deletePathsCore.includes('this.deletePathCore(targets[0], recursive, progressId)'));
	});

	test('starts recycle-bin, delete, and same-device move operations independently', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const moveToTrash = methodBlock(service, 'async movePathsToTrash', 'private async movePathsToTrashCore');
		const restoreTrash = methodBlock(service, 'async restoreTrashItems', 'private async restoreTrashItemsCore');
		const restoreTrashPaths = methodBlock(service, 'async restoreTrashPaths', 'private async restoreLocalTrashPath');
		const cleanupLocalTrashPath = methodBlock(service, 'private async cleanupLocalTrashPathAfterRestore', 'private async restoreRemoteTrashPath');
		const permanentDelete = methodBlock(service, 'async permanentlyDeleteTrashItems', 'private async permanentlyDeleteTrashItemsCore');
		const emptyTrash = methodBlock(service, 'async emptyTrash', 'private async emptyTrashCore');
		const deletePaths = methodBlock(service, 'async deletePaths', 'private async deletePathsCore');
		const movePaths = methodBlock(service, 'async movePathsIntoDirectory', 'private async movePathsIntoDirectoryCore');

		assert.ok(moveToTrash.includes('await this.movePathsToTrashCore(request)'));
		assert.ok(restoreTrash.includes('return this.restoreTrashItemsCore(request);'));
		assert.ok(restoreTrashPaths.includes('resolveTurboFileTrashChildPaths'));
		assert.ok(restoreTrashPaths.includes('this.isSafeTrashItem(item)'));
		assert.ok(cleanupLocalTrashPath.includes('await fsp.rmdir(item.payloadPath)'));
		assert.ok(!cleanupLocalTrashPath.includes("fsp.rm(item.payloadPath, { recursive: false"));
		assert.ok(permanentDelete.includes('await this.permanentlyDeleteTrashItemsCore(request)'));
		assert.ok(emptyTrash.includes('await this.emptyTrashCore(device, progressId)'));
		assert.ok(deletePaths.includes('await this.deletePathsCore(endpoints, recursive, progressId)'));
		assert.ok(movePaths.includes('await this.movePathsIntoDirectoryCore(sources, targetDirectory, progressId, onDelta)'));
		for (const block of [moveToTrash, restoreTrash, restoreTrashPaths, permanentDelete, emptyTrash, deletePaths, movePaths]) {
			assert.ok(!block.includes('fileOperationQueue'));
		}
	});

	test('waits for transport shutdown before acknowledging cancellation', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const cancelTransfer = methodBlock(service, 'async cancelTransfer', 'async testConnection');
		const registerCancel = methodBlock(service, 'private registerTransferCancelHandler', 'private runCancelableLocalCommand');
		const killTree = functionBlock(service, 'killLocalProcessTree');
		const withSshClient = methodBlock(service, 'private async withSshClient', 'private async copyLocalPath');

		assert.ok(service.includes('Set<() => void | Promise<void>>'));
		assert.ok(cancelTransfer.includes('await Promise.allSettled'));
		assert.ok(registerCancel.includes('handler: () => void | Promise<void>'));
		assert.ok(killTree.includes('Promise<void>'));
		assert.ok(killTree.includes("execFile('taskkill.exe'"));
		assert.ok(killTree.includes('waitForLocalProcessTermination'));
		assert.ok(service.includes('const sshClientAbortPromises = new WeakMap'));
		assert.ok(service.includes('const sshExecStreamAbortPromises = new WeakMap'));
		assert.ok(withSshClient.includes('progressId?: string'));
		assert.ok(withSshClient.includes('abortSshClientAndWait'));
	});

	test('keeps prewarmed task sessions independent from pane browsing sessions', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const preparePair = methodBlock(service, 'async prepareTransferPair', 'async transferFile');
		const acquireTransfer = methodBlock(service, 'private async acquireTransferSession', 'private acquireReadyTransferSession');
		const acquireReady = methodBlock(service, 'private acquireReadyTransferSession', 'private async waitForTransferSession');
		const leaseTask = methodBlock(service, 'private tryLeaseTaskSftpSession', 'private async waitForTransferSession');
		const closeTask = methodBlock(service, 'private async closeTaskSftpSession', 'private disposeTransferSession');
		const withDirectorySftp = methodBlock(service, 'private async withDirectorySftp', 'private async withDirectorySshClient');

		assert.ok(service.includes('private readonly taskSftpSessions'));
		assert.ok(service.includes('private readonly taskSftpPrewarmPending'));
		assert.ok(preparePair.includes('this.ensureWarmTaskSftpSession'));
		assert.ok(acquireTransfer.includes('this.acquireReadyTaskSftpSession'));
		assert.ok(acquireTransfer.includes('this.createTaskSftpSession'));
		assert.ok(!acquireTransfer.includes('this.ensureWarmDirectorySftpSession'));
		assert.ok(acquireReady.includes('this.acquireReadyTaskSftpSession'));
		assert.ok(leaseTask.includes('this.closeTaskSftpSession(session)'));
		assert.ok(closeTask.includes('this.removeTaskSftpSession(session)'));
		assert.ok(!closeTask.includes('directorySftpSessions'));
		assert.ok(withDirectorySftp.includes('progressId'));
		assert.ok(withDirectorySftp.includes('this.acquireTransferSession(endpoint, progressId)'));
	});

	test('threads cancellation ids through file mutations', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const moveToTrash = methodBlock(service, 'async movePathsToTrash', 'private async movePathsToTrashCore');
		const deletePaths = methodBlock(service, 'async deletePaths', 'private async deletePathsCore');
		const compressPath = methodBlock(service, 'async compressPath', 'private async compressPathCore');
		const extractPath = methodBlock(service, 'async extractPath', 'private async extractPathCore');

		for (const operation of [moveToTrash, deletePaths, compressPath, extractPath]) {
			assert.ok(operation.includes('progressId'));
		}
		assert.ok(moveToTrash.includes('this.movePathsToTrashCore(request)'));
		assert.ok(deletePaths.includes('this.deletePathsCore(endpoints, recursive, progressId)'));
		assert.ok(compressPath.includes('this.compressPathCore(endpoint, targetPath, progressId)'));
		assert.ok(extractPath.includes('this.extractPathCore(endpoint, targetDirectory, progressId)'));
		assert.ok(service.includes('this.throwIfTransferCanceled(progressId)'));
		assert.ok(service.includes('progressId: request.progressId'));
	});

	test('lists local directory names without per-entry lstat', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const namesIndex = service.indexOf('async listLocalDirectoryNames');
		const nextMethodIndex = service.indexOf('async statLocalEntries', namesIndex);

		assert.ok(namesIndex >= 0);
		assert.ok(nextMethodIndex > namesIndex);
		const block = service.slice(namesIndex, nextMethodIndex);
		assert.ok(block.includes('dirent.isDirectory()'));
		assert.ok(!block.includes('fsp.lstat'));
	});

	test('keeps batch direct tar transfers alive when target files are growing', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const batchDirectIndex = service.indexOf('private async tryDirectBatchTarTransferRoute');
		const batchDirectBlock = service.slice(batchDirectIndex, service.indexOf('private async tryRelayBatchTarTransfer', batchDirectIndex));

		assert.ok(batchDirectIndex >= 0);
		assert.ok(batchDirectBlock.includes('let lastActivityAt = Date.now();'));
		assert.ok(batchDirectBlock.includes('lastActivityAt = Date.now();'));
		assert.ok(batchDirectBlock.includes('getActivityTime: () => lastActivityAt'));
		assert.ok(batchDirectBlock.includes('Direct batch tar'));
	});

	test('reports direct tar bytes from the live stream without recursively scanning the target', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const batchDirect = methodBlock(service, 'private async tryDirectBatchTarTransferRoute', 'private async tryRelayBatchTarTransfer');
		const singleDirect = methodBlock(service, 'private async tryDirectTarTransferRoute', 'private async tryDirectRsyncTransfer');
		const builders = service.slice(service.indexOf('function buildTarSourcePushCommand'), service.indexOf('function waitForLocalProcessClose'));

		assert.ok(batchDirect.includes('onStderr: reportTarProgress'));
		assert.ok(singleDirect.includes('onStderr: reportTarProgress'));
		assert.ok(!batchDirect.includes('beginRemoteBatchTargetGrowthTiming'));
		assert.ok(!singleDirect.includes('beginRemotePathGrowthTiming'));
		assert.ok(builders.includes('buildDirectTarProgressPipeCommand()'));
		assert.ok(builders.includes('status=progress'));
	});

	test('propagates failures from every direct tar pipeline stage', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const pipefail = functionBlock(service, 'buildPipefailBashCommand');
		const builders = [
			functionBlock(service, 'buildTarSourcePushCommand'),
			functionBlock(service, 'buildTarItemsSourcePushCommand'),
			functionBlock(service, 'buildPreparedTarItemsSourcePushCommand'),
			functionBlock(service, 'buildTarTargetPullCommand'),
			functionBlock(service, 'buildTarItemsTargetPullCommand'),
			functionBlock(service, 'buildPreparedTarItemsTargetPullCommand')
		];

		assert.ok(pipefail.includes('set -o pipefail'));
		assert.ok(pipefail.includes('BASH_ENV=/dev/null'));
		assert.ok(pipefail.includes('bash --noprofile --norc -c'));
		assert.ok(!pipefail.includes('bash -lc'));
		for (const builder of builders) {
			assert.ok(builder.includes('buildPipefailBashCommand('));
			assert.ok(builder.includes('|'));
		}
		assert.strictEqual(builders[0].match(/\$\{remoteShell\}/g)?.length, 1);
		assert.strictEqual(builders[1].match(/\$\{remoteShell\}/g)?.length, 1);
	});

	test('uses a separate long inactivity timeout for direct tar finalization', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const batchDirect = methodBlock(service, 'private async tryDirectBatchTarTransferRoute', 'private async tryRelayBatchTarTransfer');
		const singleDirect = methodBlock(service, 'private async tryDirectTarTransferRoute', 'private async tryDirectRsyncTransfer');
		const tarTimeout = numericProductConstant(service, 'DIRECT_TAR_STALL_TIMEOUT_MS');
		const otherTransferTimeout = numericProductConstant(service, 'DIRECT_TRANSFER_STALL_TIMEOUT_MS');

		assert.ok(tarTimeout >= 10 * 60 * 1000);
		assert.ok(tarTimeout > otherTransferTimeout);
		for (const transfer of [batchDirect, singleDirect]) {
			assert.ok(transfer.includes('inactivityTimeoutMs: DIRECT_TAR_STALL_TIMEOUT_MS'));
			assert.ok(transfer.includes('${DIRECT_TAR_STALL_TIMEOUT_MS} ms'));
		}
	});

	test('bounds remote tar stream channel acquisition and closes late streams', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const openStream = methodBlock(service, 'private openRemoteCommandStream', 'private transformImageBuffer');

		assert.ok(openStream.includes('REMOTE_EXEC_CHANNEL_OPEN_TIMEOUT_MS'));
		assert.ok(openStream.includes('setTimeout('));
		assert.ok(openStream.includes('clearTimeout('));
		assert.ok(openStream.indexOf('setTimeout(') < openStream.indexOf('client.exec('));
		assert.match(openStream, /if \(settled\) \{[\s\S]*?stream\.(?:close|destroy)\(\)/);
		assert.match(openStream, /try \{[\s\S]*?client\.exec\([\s\S]*?\} catch \(error\) \{/);
	});

	test('feeds large remote batch tar selections through stdin in native and ssh2 downloads', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const nativeDownload = methodBlock(service, 'private async runNativeLocalTarDownload', 'private async runParallelLocalDirectoryTarUpload');
		const batchDownload = methodBlock(service, 'private async runRemoteBatchTarDownload', 'private async tryDirectBatchTarTransfer');
		const remoteDownloadPipe = methodBlock(service, 'private async pipeRemoteTarDownload', 'private async createLocalTarRootAliasIfNeeded');

		assert.ok(nativeDownload.includes('remoteInput?: Uint8Array'));
		assert.ok(nativeDownload.includes("writeInputToWritableStream(sshProcess.stdin, remoteInput, 'native tar download path list')"));
		assert.ok(batchDownload.includes('createRemoteBatchTarSourcePlan'));
		assert.ok(batchDownload.includes('sourcePlan.input'));
		assert.match(batchDownload, /this\.pipeRemoteTarDownload\(configResult\.config, sourcePlan\.command,[\s\S]*?sourcePlan\.input\)/);
		assert.ok(remoteDownloadPipe.includes("remoteInput ? writeInputToWritableStream(sourceStream.stream, remoteInput, 'tar download path list') : Promise.resolve()"));
	});

	test('keeps large direct and relay tar commands compact while preserving streaming progress', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const direct = methodBlock(service, 'private async tryDirectBatchTarTransferRoute', 'private async tryRelayBatchTarTransfer');
		const relay = methodBlock(service, 'private async tryRelayBatchTarTransfer', 'private async runConcurrentBatchTransfer');
		const streamRelay = methodBlock(service, 'private async relayRemoteStreamsWithWatchdog', 'private transformImageBuffer');

		assert.ok(direct.includes('isTurboFileBatchCommandSafe'));
		assert.ok(direct.includes('prepareRemoteBatchTarTarget'));
		assert.ok(direct.includes('input: sourcePlan.input'));
		assert.ok(relay.includes('createRemoteBatchTarSourcePlan'));
		assert.ok(relay.includes('execRemoteWithInput'));
		assert.ok(relay.includes('relayRemoteStreamsWithWatchdog(sourceStream, targetStream, onArchiveDelta, request.progressId, sourcePlan.input)'));
		assert.ok(streamRelay.includes("writeInputToWritableStream(source.stream, input, 'tar relay path list')"));
		assert.ok(streamRelay.includes('Promise.all([archivePipeline, inputWrite, source.close, target.close])'));
	});

	test('requires a complete reverse rsync stdin manifest before source cleanup can succeed', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const builder = methodBlock(service, 'function buildLocalWindowsReverseParallelRsyncCommand', 'function buildLocalWindowsReverseParallelRsyncInput');
		const input = methodBlock(service, 'function buildLocalWindowsReverseParallelRsyncInput', 'function getLocalWindowsRsyncConfigPaths');

		assert.ok(builder.includes("'set -e'"));
		assert.ok(builder.indexOf("'set -e'") < builder.indexOf("'cat > \"$manifest\"'"));
		assert.ok(builder.includes('saw_end=0'));
		assert.match(builder, /kind[^\n]*Z[^\n]*saw_end=1/);
		assert.ok(builder.indexOf('kind" = Z') < builder.indexOf('kind" = C'));
		assert.ok(
			builder.includes('[ "$saw_end" -eq 1 ] || exit 1')
			|| builder.includes('if [ "$saw_end" -ne 1 ]; then exit 1; fi')
		);
		assert.ok(input.includes("records.push('Z', '', '', '', '', '')"));
	});

	test('deletes a large remote cut selection through a null-delimited list', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const cleanup = methodBlock(service, 'private async deleteBatchSources', 'private joinBatchTargetPath');

		assert.ok(cleanup.includes('buildPosixDeleteManyFromInputCommand(true)'));
		assert.ok(cleanup.includes('execRemoteWithInput'));
		assert.ok(cleanup.includes('inactivityTimeoutMs'));
	});

	test('captures a Windows target before local cut drag but keeps local copy direct', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const startIndex = service.indexOf('async startWindowsFileDrag');
		const startBlock = service.slice(startIndex, service.indexOf('private async startCapturedWindowsFileDrag', startIndex));

		assert.ok(startIndex >= 0);
		assert.ok(startBlock.includes("const operation = request.operation ?? 'copy';"));
		assert.ok(startBlock.includes("request.source.kind === 'local' && operation === 'copy'"));
		assert.ok(startBlock.includes('return this.startCapturedWindowsFileDrag(request, window);'));
	});

	test('uses the 1.148 Electron fake-directory drag for captured Windows targets', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const capturedDrag = methodBlock(service, 'private async startCapturedWindowsFileDrag', 'private getWindowsDragCopyHookPaths');
		const completion = methodBlock(service, 'async completeWindowsFileDrag', 'private async startCapturedWindowsFileDrag');

		assert.ok(capturedDrag.includes('window.webContents.startDrag({'));
		assert.ok(capturedDrag.includes('file: paths.fakeDirectory'));
		assert.ok(capturedDrag.includes('files: [paths.fakeDirectory]'));
		assert.ok(capturedDrag.includes('const token = request.sessionId'));
		assert.ok(capturedDrag.includes('waitForWindowsDragCopyHookTarget(paths.targetFile, fakeDirectoryName, token)'));
		assert.ok(completion.includes('this.activeWindowsDragSessions.has(sessionId)'));
		assert.ok(completion.includes('this.completedInternalWindowsDrags.add(sessionId)'));
		assert.ok(!capturedDrag.includes('startWindowsDragSourceHelper'));
		assert.ok(!capturedDrag.includes('cancelChromiumWindowsDrag'));
	});

	test('settles every native Windows drag session without a long post-drop wait', () => {
		const contract = fs.readFileSync(path.join(process.cwd(), 'src/vs/platform/turbofile/common/turbofile.ts'), 'utf8');
		const service = fs.readFileSync(servicePath(), 'utf8');
		const startDrag = methodBlock(service, 'async startWindowsFileDrag', 'async completeWindowsFileDrag');
		const waitForTarget = methodBlock(service, 'private async waitForWindowsDragCopyHookTarget', 'async getLocalDesktopPath');

		assert.deepStrictEqual({
			contractSessionId: contract.includes('readonly sessionId: string;'),
			completionApi: contract.includes('completeWindowsFileDrag(sessionId: string): Promise<void>;'),
			internalResult: contract.includes('readonly internal?: boolean;'),
			validatesToken: startDrag.includes('isValidWindowsDragToken(request.sessionId)'),
			rejectsDuplicate: startDrag.includes('this.activeWindowsDragSessions.has(request.sessionId)'),
			registersSession: startDrag.includes('this.activeWindowsDragSessions.add(request.sessionId)'),
			shortSettle: service.includes('const WINDOWS_DRAG_TARGET_SETTLE_MS = 2000;'),
			internalFirst: waitForTarget.indexOf('this.completedInternalWindowsDrags.has(sessionId)') < waitForTarget.indexOf('fsp.readFile(targetFile'),
			cleanup: service.includes('this.completedInternalWindowsDrags.delete(request.sessionId);') && service.includes('this.activeWindowsDragSessions.delete(request.sessionId);')
		}, {
			contractSessionId: true,
			completionApi: true,
			internalResult: true,
			validatesToken: true,
			rejectsDuplicate: true,
			registersSession: true,
			shortSettle: true,
			internalFirst: true,
			cleanup: true
		});
	});

	test('starts local folder and batch copies without recursive size discovery', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const transferFile = methodBlock(service, 'async transferFile', 'async transferBatch');
		const localBatch = methodBlock(service, 'private async runLocalNativeBatchTransfer', 'private async runSameRemoteNativeBatchTransfer');
		const nativeDirectoryCopy = methodBlock(service, 'private async copyLocalDirectoryNativeWithProgress', 'private async moveLocalPathNative');

		assert.ok(!transferFile.includes('getLocalPathTransferSize(request.source.path'));
		assert.ok(!localBatch.includes('getLocalBatchTransferSize'));
		assert.ok(!service.includes('private async getLocalBatchTransferSize'));
		assert.ok(localBatch.includes('totalBytes > 0 ? Math.min(transferredBytes, totalBytes) : transferredBytes'));
		assert.ok(nativeDirectoryCopy.indexOf('runLocalRobocopyCommand') < nativeDirectoryCopy.indexOf('getLocalPathSize(targetPath)'));
	});

	test('does not discover directory totals before protocol dispatch', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const batchTar = methodBlock(service, 'private async tryBatchTarTransfer', 'private createRemoteBatchTarPlan');
		const sameRemote = methodBlock(service, 'private async trySameRemoteCopy', 'private async tryDirectTarTransfer');
		const directTar = methodBlock(service, 'private async tryDirectTarTransfer', 'private async tryDirectTarTransferRoute');
		const directScp = methodBlock(service, 'private async tryDirectScpTransfer', 'private async tryDirectScpTransferRoute');
		const directSftp = methodBlock(service, 'private async tryDirectSftpTransferRoute', 'private async tryTunneledRsyncRelayTransfer');
		const tarRelay = methodBlock(service, 'private async tryTarRelayTransfer', 'private async tryStreamRelayTransfer');

		assert.ok(!batchTar.includes('getLocalBatchTarBytes'));
		assert.ok(!batchTar.includes('getRemoteBatchSourceContentSize'));
		assert.ok(!sameRemote.includes("if (sourceType === 'directory')"));
		assert.ok(!directTar.includes('getRemotePathContentSizeByCommand(request.source)'));
		assert.ok(!directScp.includes('|| await this.getRemotePathSizeByCommand(request.source)'));
		assert.ok(!directSftp.includes('if (bytes === 0)'));
		assert.ok(!tarRelay.includes('getRemotePathContentSizeByCommand(request.source)'));
	});

	test('falls back from tar to sftp on single-directory and batch routes', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const transferFileCore = methodBlock(service, 'private async transferFileCore', 'private async transferBetweenSshDevices');
		const transferBatchCore = methodBlock(service, 'private async transferBatchCore', 'private getBatchExpectedBytes');
		const batchAttempt = methodBlock(service, 'private async runSshToSshBatchTransferAttempt', 'private async runLocalNativeBatchTransfer');
		const forceProtocol = functionBlock(service, 'forceBatchTransferProtocol');

		assert.deepStrictEqual({
			singleDirectoryDoesNotStopAfterTarUpload: !transferFileCore.includes('Tar upload unavailable for directory transfer.'),
			singleDirectoryDoesNotStopAfterTarDownload: !transferFileCore.includes('Tar download unavailable for directory transfer.'),
			singleDirectoryUsesExistingSftpUpload: transferFileCore.includes('Preparing SFTP upload.'),
			singleDirectoryUsesExistingSftpDownload: transferFileCore.includes('Downloading over SFTP.'),
			batchDetectsTarFallback: transferBatchCore.includes("transferPlan.attempts.some(attempt => attempt.protocol === 'sftp')"),
			batchForcesSftpFallback: transferBatchCore.includes("forceBatchTransferProtocol(request, 'sftp')"),
			batchDoesNotUseTarOnlyFailure: !transferBatchCore.includes('Tar transfer unavailable for batch transfer.'),
			sshBatchIsolatesEveryAttempt: batchAttempt.includes('forceBatchTransferProtocol(request, attempt.protocol)'),
			protocolOverrideCarriesAttemptProtocol: forceProtocol.includes('attemptProtocol: preferredProtocol'),
			protocolOverrideCoversBothSshEndpoints: forceProtocol.includes("request.source.kind === 'ssh'")
				&& forceProtocol.includes("request.targetDirectory.kind === 'ssh'")
		}, {
			singleDirectoryDoesNotStopAfterTarUpload: true,
			singleDirectoryDoesNotStopAfterTarDownload: true,
			singleDirectoryUsesExistingSftpUpload: true,
			singleDirectoryUsesExistingSftpDownload: true,
			batchDetectsTarFallback: true,
			batchForcesSftpFallback: true,
			batchDoesNotUseTarOnlyFailure: true,
			sshBatchIsolatesEveryAttempt: true,
			protocolOverrideCarriesAttemptProtocol: true,
			protocolOverrideCoversBothSshEndpoints: true
		});
	});

	test('reports same-device directory copy progress without a recursive size prescan', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const sameRemote = methodBlock(service, 'private async trySameRemoteCopy', 'private async tryDirectTarTransfer');
		const remoteCopy = methodBlock(service, 'private async execRemoteCopyWithProgress', 'private async copyLocalFileWithProgress');
		const posixCopy = functionBlock(service, 'buildPosixCopyCommand');

		assert.ok(sameRemote.includes("const reportsNativeProgress = sourceType === 'directory' && !isWindowsCopy;"));
		assert.ok(sameRemote.includes('buildPosixCopyCommand(request.source.path, request.target.path, reportsNativeProgress)'));
		assert.ok(!sameRemote.includes('getRemotePathContentSizeByCommand(request.source)'));
		assert.ok(posixCopy.includes('/proc/$tf_copy_pid/io'));
		assert.ok(posixCopy.includes('TURBOFILE_COPY_BYTES'));
		assert.ok(remoteCopy.includes('onStderr: chunk => { control?.accept(chunk); handleNativeProgress(chunk); }'));
		assert.ok(remoteCopy.includes('parseRemoteCopyProgressBytes'));
	});

	test('keeps recycle-bin deletion separate from permanent cleanup', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const moveToTrash = methodBlock(service, 'async movePathsToTrash', 'async listTrashItems');
		const localMove = methodBlock(service, 'private async moveLocalPathToTrash', 'private async listLocalTrashItems');
		const remoteMove = methodBlock(service, 'private async moveRemotePathsToTrash', 'private async listRemoteTrashItems');

		assert.ok(moveToTrash.includes('moveLocalPathToTrash'));
		assert.ok(moveToTrash.includes('moveRemotePathsToTrash'));
		assert.ok(localMove.includes('fsp.rename(source.endpoint.path, payloadPath)'));
		assert.ok(remoteMove.includes('execRemoteWithInput'));
		assert.ok(!moveToTrash.includes('fsp.rm('));
		assert.ok(!moveToTrash.includes('deletePath('));
		assert.ok(!moveToTrash.includes('deletePaths('));
		assert.ok(!moveToTrash.includes('transferFile('));
		assert.ok(!moveToTrash.includes('transferBatch('));
	});

	test('writes pending recycle-bin metadata before moving a local source', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const localMove = methodBlock(service, 'private async moveLocalPathToTrash', 'private async listLocalTrashItems');

		assert.ok(localMove.indexOf('writeFile(pendingPath') < localMove.indexOf('fsp.rename(source.endpoint.path, payloadPath)'));
		assert.ok(localMove.indexOf('fsp.rename(source.endpoint.path, payloadPath)') < localMove.indexOf('fsp.rename(pendingPath, metadataPath)'));
		assert.ok(!localMove.includes('calculatePathSize'));
		assert.ok(!localMove.includes('getLocalPathSize'));
	});

	test('hides Windows recycle-bin storage containers without changing their paths', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const localMove = methodBlock(service, 'private async moveLocalPathToTrash', 'private async listLocalTrashItems');
		const localRoots = methodBlock(service, 'private async getLocalTrashRoots', 'private localPathExists');
		const windowsMove = methodBlock(service, 'function buildWindowsTrashMoveBatchCommand', 'function parseRemoteTrashMoveResults');

		assert.deepStrictEqual({
			newLocalContainersAreHidden: localMove.includes('await this.hideLocalTrashContainer(trashRoot)'),
			existingLocalContainersAreHidden: localRoots.includes('this.hideLocalTrashContainer(trashRoot)'),
			usesWindowsHiddenAndSystemAttributes: service.includes("runLocalCommand('attrib.exe', ['+H', '+S', container])"),
			remoteWindowsContainersAreHidden: windowsMove.includes('[System.IO.FileAttributes]::Hidden') && windowsMove.includes('[System.IO.FileAttributes]::System')
		}, {
			newLocalContainersAreHidden: true,
			existingLocalContainersAreHidden: true,
			usesWindowsHiddenAndSystemAttributes: true,
			remoteWindowsContainersAreHidden: true
		});
	});

	test('moves a remote recycle-bin batch through one native command round trip', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const remoteBatch = methodBlock(service, 'private async moveRemotePathsToTrash', 'private async listRemoteTrashItems');

		assert.ok(remoteBatch.includes('execRemoteWithInput'));
		assert.ok(remoteBatch.includes('buildPosixTrashMoveBatchCommand'));
		assert.ok(remoteBatch.includes('buildWindowsTrashMoveBatchCommand'));
		assert.ok(remoteBatch.includes('prepared.pendingPath, prepared.metadataPath, JSON.stringify(prepared.item)'));
		assert.ok(!remoteBatch.includes('writeRemoteTextFile'));
		assert.ok(!remoteBatch.includes('renameRemotePath'));
		assert.ok(!remoteBatch.includes('transferFile('));
		assert.ok(!remoteBatch.includes('transferBatch('));
	});

	test('lists remote recycle-bin metadata in bounded native command batches', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const remoteList = methodBlock(service, 'private async listRemoteTrashItems', 'private async restoreRemoteTrashItem');

		assert.ok(remoteList.includes('buildPosixTrashListCommand'));
		assert.ok(remoteList.includes('buildWindowsTrashListCommand'));
		assert.ok(remoteList.includes('execRemoteBytes'));
		assert.ok(remoteList.includes("'trash-list'"));
		assert.ok(remoteList.includes('listRemoteTrashMetadataWithSftp'));
		assert.ok(!remoteList.includes('readRemoteFileBufferDirect'));
		assert.ok(!remoteList.includes('remotePathExists'));
	});

	test('permanently deletes recycle-bin payloads and metadata in one native batch', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const permanentDelete = methodBlock(service, 'async permanentlyDeleteTrashItems', 'async emptyTrash');

		assert.ok(permanentDelete.includes('deleteTrashItemsNative'));
		assert.ok(!permanentDelete.includes('deletePaths('));
	});

	test('empties a device recycle bin directly without listing every item first', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const emptyTrash = methodBlock(service, 'async emptyTrash', 'async getTrashState');

		assert.ok(emptyTrash.includes('emptyTrashNative'));
		assert.ok(!emptyTrash.includes('listTrashItems('));
		assert.ok(!emptyTrash.includes('permanentlyDeleteTrashItems('));
	});

	test('probes the recycle-bin icon state without loading every metadata record', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const getTrashState = methodBlock(service, 'async getTrashState', 'private withLocalTrashIdentity');

		assert.ok(getTrashState.includes('hasTrashItemsNative'));
		assert.ok(!getTrashState.includes('listTrashItems('));
	});

	test('uses pane-prepared direct routes without transfer-time verification state', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const removedNegativeState = [
			'DIRECT_SSH_ROUTE_FAILURE_COOLDOWN_MS',
			'DIRECT_SSH_ROUTE_CACHE_TTL_MS',
			'directSshRouteFailureCooldowns',
			'filterDirectSshRoutesByCooldown',
			'markDirectSshRouteFailure',
			'clearDirectSshRouteFailure',
			'clearDirectSshRouteCache',
			'getDirectSshRouteFailureKey'
		];

		assert.deepStrictEqual({
			removedNegativeState: removedNegativeState.every(name => !service.includes(name)),
			importsPreparedRouteCache: service.includes("TurboFilePreparedDirectRouteCache } from '../common/turbofilePreparedDirectRouteCache.js';"),
			noDuplicateRouteType: !service.includes("type TurboFileDirectSshRoute = 'source-push' | 'target-pull';"),
			noTransferVerificationMethod: !service.includes('private async verifyDirectSshRoute('),
			preparedAttemptWrapper: service.includes('private async runPreparedDirectRouteAttempt<T>('),
			noTransferVerificationMarker: !service.includes('__TURBOFILE_DIRECT_READY__'),
			typedRemoteCommandExit: service.includes('class TurboFileRemoteCommandExitError extends Error') && service.includes('new TurboFileRemoteCommandExitError('),
			backgroundProtocolProof: service.includes('private async probeDirectScpRoute(')
				&& service.includes('execRemoteBytes(executorSession.client, command, { timeoutMs: remainingMs, token })'),
			preparedFailureIsTyped: service.includes("throw new TurboFileDirectDataError(route, [{ route, stage: 'initial' }], error);")
		}, {
			removedNegativeState: true,
			importsPreparedRouteCache: true,
			noDuplicateRouteType: true,
			noTransferVerificationMethod: true,
			preparedAttemptWrapper: true,
			noTransferVerificationMarker: true,
			typedRemoteCommandExit: true,
			backgroundProtocolProof: true,
			preparedFailureIsTyped: true
		});
	});

	test('routes every direct SSH protocol entry through the prepared attempt wrapper', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const entries = [
			methodBlock(service, 'private async tryDirectScpTransfer', 'private async tryDirectScpTransferRoute'),
			methodBlock(service, 'private async tryDirectSftpTransfer', 'private async tryDirectSftpTransferRoute'),
			methodBlock(service, 'private async tryDirectTarTransfer', 'private async tryDirectTarTransferRoute'),
			methodBlock(service, 'private async tryDirectRsyncTransfer', 'private async tryDirectRsyncTransferRoute'),
			methodBlock(service, 'private async tryDirectBatchTarTransfer', 'private async tryDirectBatchTarTransferRoute'),
			methodBlock(service, 'private async tryDirectBatchRsyncTransfer', 'private async tryDirectBatchRsyncTransferRoute')
		];

		assert.deepStrictEqual(entries.map(entry => ({
			preparedAttempt: entry.includes('this.runPreparedDirectRouteAttempt('),
			legacyVerifier: entry.includes('this.runVerifiedDirectRouteAttempt('),
			resolvesRoutesDirectly: entry.includes('this.resolveDirectSshRoutes('),
			loopsRoutesDirectly: entry.includes('for (const route of routes)')
		})), entries.map(() => ({
			preparedAttempt: true,
			legacyVerifier: false,
			resolvesRoutesDirectly: false,
			loopsRoutesDirectly: false
		})));
	});

	test('bounds silent direct SCP and SFTP without imposing a ten-second data deadline', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const directScp = methodBlock(service, 'private async tryDirectScpTransferRoute', 'private supportsDirectScpLegacyOption');
		const directSftp = methodBlock(service, 'private async tryDirectSftpTransferRoute', 'private async tryTunneledRsyncRelayTransfer');

		assert.deepStrictEqual([directScp, directSftp].map(block => ({
			keepsGrowthTiming: block.includes('beginRemoteFileGrowthTiming') && block.includes('beginRemotePathGrowthTiming'),
			keepsBoundedMkdir: block.includes('timeoutMs: DIRECT_TRANSFER_STALL_TIMEOUT_MS'),
			activityIsIndependentOfDisplayedBytes: block.includes('const reportActivity = (): void => { lastActivityAt = Date.now(); };')
				&& (block.match(/}, undefined, undefined, reportActivity\)/g)?.length === 2),
			boundsSilenceUsingExistingGrowth: block.includes('getActivityTime: () => lastActivityAt')
				&& block.includes('REMOTE_DIRECTORY_TRANSFER_INACTIVITY_TIMEOUT_MS : REMOTE_FILE_TRANSFER_INACTIVITY_TIMEOUT_MS'),
			noShortDataDeadline: !block.includes('inactivityTimeoutMs: DIRECT_TRANSFER_STALL_TIMEOUT_MS')
		})), [directScp, directSftp].map(() => ({
			keepsGrowthTiming: true,
			keepsBoundedMkdir: true,
			activityIsIndependentOfDisplayedBytes: true,
			boundsSilenceUsingExistingGrowth: true,
			noShortDataDeadline: true
		})));
	});

	test('falls back to the remote shell size only when direct SCP target stat fails', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const directScp = methodBlock(service, 'private async tryDirectScpTransferRoute', 'private async prepareRemoteScpCredential');
		const dataCommand = directScp.indexOf('await this.execRemote(client, scpCommand, {');
		const targetStat = directScp.indexOf('const targetSize = await this.withDirectorySftp(request.target');
		const shellFallback = directScp.indexOf('.catch(() => this.getRemotePathSizeByCommand(request.target, request.progressId));', targetStat);
		const mismatchCheck = directScp.indexOf('if (targetSize !== bytes)', targetStat);

		assert.deepStrictEqual({
			validatesAfterDataCommand: dataCommand >= 0 && targetStat > dataCommand,
			usesSftpStatFirst: targetStat >= 0 && directScp.includes('this.remoteStat(sftp, request.target.path)).size'),
			shellQueryIsStatFailureFallback: shellFallback > targetStat && shellFallback < mismatchCheck,
			shellQueryIsNotUnconditional: (directScp.match(/getRemotePathSizeByCommand\(request\.target, request\.progressId\)/g)?.length ?? 0) === 1,
			keepsMismatchFailure: mismatchCheck > shellFallback && directScp.includes('Direct SCP size mismatch: expected ${bytes}, got ${targetSize}.'),
			keepsCancellationPostcheck: directScp.indexOf('this.throwIfTransferCanceled(request.progressId);', shellFallback) > shellFallback
		}, {
			validatesAfterDataCommand: true,
			usesSftpStatFirst: true,
			shellQueryIsStatFailureFallback: true,
			shellQueryIsNotUnconditional: true,
			keepsMismatchFailure: true,
			keepsCancellationPostcheck: true
		});
	});

	test('reports typed direct fallback reasons without exposing direct errors', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const common = fs.readFileSync(path.join(process.cwd(), 'src/vs/platform/turbofile/common/turbofile.ts'), 'utf8');
		const singlePlan = methodBlock(service, 'private async transferBetweenSshDevices', 'private async trySshToSshTransferAttempt');
		const batchPlan = methodBlock(service, 'private async runSshToSshBatchTransferPlan', 'private async runSshToSshBatchTransferAttempt');
		const wrapper = methodBlock(service, 'private async runPreparedDirectRouteAttempt<T>', 'private async resolveRemoteRsyncSshBinary');
		const fallbackMapping = functionBlock(service, 'getDirectFallbackProgress');
		const directEntries = [
			methodBlock(service, 'private async tryDirectScpTransfer', 'private async tryDirectScpTransferRoute'),
			methodBlock(service, 'private async tryDirectSftpTransfer', 'private async tryDirectSftpTransferRoute'),
			methodBlock(service, 'private async tryDirectTarTransfer', 'private async tryDirectTarTransferRoute'),
			methodBlock(service, 'private async tryDirectRsyncTransfer', 'private async tryDirectRsyncTransferRoute'),
			methodBlock(service, 'private async tryDirectBatchTarTransfer', 'private async tryDirectBatchTarTransferRoute'),
			methodBlock(service, 'private async tryDirectBatchRsyncTransfer', 'private async tryDirectBatchRsyncTransferRoute')
		];

		assert.deepStrictEqual({
			typedEvent: common.includes("readonly directFallbackReason?: 'unavailable' | 'data-failure';"),
			importsTypedErrors: service.includes('TurboFileDirectDataError') && service.includes('TurboFileDirectUnavailableError'),
			typedMapping: fallbackMapping.includes('error instanceof TurboFileDirectUnavailableError')
				&& fallbackMapping.includes('error instanceof TurboFileDirectDataError')
				&& fallbackMapping.includes("directFallbackReason: 'unavailable'")
				&& fallbackMapping.includes("directFallbackReason: 'data-failure'"),
			plansUseTypedMapping: [singlePlan, batchPlan].every(block => block.includes("attempt.route === 'direct'")
				&& block.includes("nextAttempt")
				&& block.includes("route === 'relay'")
				&& block.includes('getDirectFallbackProgress(error)')
				&& block.includes('directFallback.detail')
				&& block.includes('directFallbackReason: directFallback.directFallbackReason')),
			fixedFallbackDetails: fallbackMapping.includes('直连不可用，正在中转。')
				&& fallbackMapping.includes('直连传输失败，正在中转。'),
			typedMappingDoesNotInspectMessages: !fallbackMapping.includes('.message') && !fallbackMapping.includes('formatTransferError'),
			preparedFailureCarriesRoute: wrapper.includes("throw new TurboFileDirectDataError(route, [{ route, stage: 'initial' }], error);"),
			sixPreparedRouteConsumers: directEntries.every(entry => entry.includes('runPreparedDirectRouteAttempt'))
		}, {
			typedEvent: true,
			importsTypedErrors: true,
			typedMapping: true,
			plansUseTypedMapping: true,
			fixedFallbackDetails: true,
			typedMappingDoesNotInspectMessages: true,
			preparedFailureCarriesRoute: true,
			sixPreparedRouteConsumers: true
		});
	});

	test('preserves concurrent batch typed errors and uses the chosen strategy for completion', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const transferFileCore = methodBlock(service, 'private async transferFileCore', 'private async transferBetweenSshDevices');
		const transferBetweenSshDevices = methodBlock(service, 'private async transferBetweenSshDevices', 'private async trySshToSshTransferAttempt');
		const concurrentBatch = methodBlock(service, 'private async runConcurrentBatchTransfer', 'private fireBatchAggregateProgress');
		const successfulResultBranch = concurrentBatch.indexOf('if (result.ok) {');
		const canceledResult = concurrentBatch.indexOf('TRANSFER_CANCELED_MESSAGE');

		assert.deepStrictEqual({
			childCoreCanPreserveTypedErrors: transferFileCore.includes('preserveDirectErrors')
				&& transferFileCore.includes('error instanceof TurboFileDirectUnavailableError')
				&& transferFileCore.includes('error instanceof TurboFileDirectDataError'),
			sshPlanCanPreserveTypedErrors: transferBetweenSshDevices.includes('preserveDirectErrors')
				&& transferBetweenSshDevices.includes('throw error;'),
			concurrentAttemptDefersTypedErrors: concurrentBatch.includes('runTurboFileConcurrentBatchAttempt({')
				&& concurrentBatch.includes('controller.captureDirectError(error)'),
			recordsOnlySuccessfulChildResults: concurrentBatch.includes('controller.recordResult(result)'),
			cancellationTracksOnlySuccessfulStrategies: concurrentBatch.includes("const successfulStrategies = new Set<ITurboFileTransferResult['strategy']>();")
				&& concurrentBatch.indexOf('successfulStrategies.add(result.strategy);') > successfulResultBranch,
			cancellationUsesSuccessfulStrategyOrAttemptFallback: concurrentBatch.includes('[...successfulStrategies][0] ?? fallbackStrategy')
				&& concurrentBatch.indexOf('[...successfulStrategies][0] ?? fallbackStrategy') < canceledResult,
			relayFallbackUsesDirectionalAttempt: concurrentBatch.includes("request.strategyHint === 'relay'")
				&& concurrentBatch.includes('transferAttemptToDirectionalStrategy(request.source, request.targetDirectory, this.getInitialBatchTransferAttempt(request, items))'),
			completeUsesChosenStrategy: concurrentBatch.includes("'complete', 'Batch transfer completed.'")
				&& concurrentBatch.includes('strategy: chosenStrategy')
				&& concurrentBatch.includes('this.createBatchTransferResult(failed === 0, chosenStrategy,')
		}, {
			childCoreCanPreserveTypedErrors: true,
			sshPlanCanPreserveTypedErrors: true,
			concurrentAttemptDefersTypedErrors: true,
			recordsOnlySuccessfulChildResults: true,
			cancellationTracksOnlySuccessfulStrategies: true,
			cancellationUsesSuccessfulStrategyOrAttemptFallback: true,
			relayFallbackUsesDirectionalAttempt: true,
			completeUsesChosenStrategy: true
		});
	});

	test('keeps batch cut cleanup outside direct route retries and terminal after copied data', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const batchTransferFlow = fs.readFileSync(batchTransferFlowPath(), 'utf8');
		const directBatchTar = methodBlock(service, 'private async tryDirectBatchTarTransfer', 'private async tryDirectBatchTarTransferRoute');
		const directBatchTarRoute = methodBlock(service, 'private async tryDirectBatchTarTransferRoute', 'private async tryRelayBatchTarTransfer');
		const directBatchRsync = methodBlock(service, 'private async tryDirectBatchRsyncTransfer', 'private async tryDirectBatchRsyncTransferRoute');
		const directBatchRsyncRoute = methodBlock(service, 'private async tryDirectBatchRsyncTransferRoute', 'private async tryTunneledBatchRsyncRelayTransfer');
		const batchAttempt = methodBlock(service, 'private async runSshToSshBatchTransferAttempt', 'private async runLocalNativeBatchTransfer');
		const batchPlan = methodBlock(service, 'private async runSshToSshBatchTransferPlan', 'private async runSshToSshBatchTransferAttempt');
		const transferBatchCore = methodBlock(service, 'private async transferBatchCore', 'private getBatchExpectedBytes');
		const batchTar = methodBlock(service, 'private async tryBatchTarTransfer', 'private createRemoteBatchTarPlan');
		const batchFlow = functionBlock(batchTransferFlow, 'runTurboFileBatchTransferFlow');
		const preparedAttempt = directBatchTar.indexOf('this.runPreparedDirectRouteAttempt(');
		const finalDataAttempt = batchFlow.indexOf('await options.runAttempt(');
		const sourceCleanup = batchFlow.indexOf('await options.cleanupSources(');

		assert.deepStrictEqual({
			tarCoordinatorHasOperation: directBatchTar.slice(0, directBatchTar.indexOf('{')).includes('operation:'),
			tarRouteHasOperation: directBatchTarRoute.slice(0, directBatchTarRoute.indexOf('{')).includes('operation:'),
			tarRouteCleansSources: directBatchTarRoute.includes('cleanupBatchSourcesAfterTar(') || directBatchTarRoute.includes('deleteBatchSources('),
			tarCoordinatorCleansSources: directBatchTar.includes('cleanupBatchSourcesAfterTar(') || directBatchTar.includes('deleteBatchSources('),
			preparedAttemptExists: preparedAttempt >= 0,
			usesRuntimeCoordinator: batchPlan.includes('await runTurboFileBatchTransferFlow({'),
			cleanupAfterFinalDataSuccess: finalDataAttempt >= 0 && sourceCleanup > finalDataAttempt,
			finalCleanupOnce: (batchFlow.match(/await options\.cleanupSources\(/g)?.length ?? 0) === 1,
			tarDefinedDirectResultIsTerminal: batchTar.includes('if (directResult) {\n\t\t\t\t\t\treturn directResult;'),
			rsyncRouteCleansSources: directBatchRsyncRoute.includes('cleanupBatchSourcesAfterTar(') || directBatchRsyncRoute.includes('deleteBatchSources('),
			rsyncCoordinatorCleansSources: directBatchRsync.includes('cleanupBatchSourcesAfterTar(') || directBatchRsync.includes('deleteBatchSources('),
			batchAttemptCleansSources: batchAttempt.includes('cleanupBatchSourcesAfterTar(') || batchAttempt.includes('deleteBatchSources('),
			completedCleanupFailureIsTerminal: batchFlow.includes("if (!result.ok || options.operation === 'copy')"),
			transferCoreCleanupFailureIsTerminal: transferBatchCore.includes('tarBatch && (tarBatch.ok || tarBatch.completed === items.length)')
				&& transferBatchCore.includes('localRsyncBatch && (localRsyncBatch.ok || localRsyncBatch.completed === items.length)'),
			noRecycleBinFallback: ![directBatchTar, directBatchTarRoute, directBatchRsync, directBatchRsyncRoute, batchAttempt, batchPlan].some(block => block.includes('movePathsToTrash('))
		}, {
			tarCoordinatorHasOperation: false,
			tarRouteHasOperation: false,
			tarRouteCleansSources: false,
			tarCoordinatorCleansSources: false,
			preparedAttemptExists: true,
			usesRuntimeCoordinator: true,
			cleanupAfterFinalDataSuccess: true,
			finalCleanupOnce: true,
			tarDefinedDirectResultIsTerminal: true,
			rsyncRouteCleansSources: false,
			rsyncCoordinatorCleansSources: false,
			batchAttemptCleansSources: false,
			completedCleanupFailureIsTerminal: true,
			transferCoreCleanupFailureIsTerminal: true,
			noRecycleBinFallback: true
		});
	});

	test('reuses warm pane sessions for background route proof without owning their lifetime', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const connect = methodBlock(service, 'private async connect(config: ConnectConfig', 'private async getDirectorySftpSession');
		const pairProbe = methodBlock(service, 'private async runDirectScpProbePair', 'private async createEmptyRemoteProbeFile');
		const routeProbe = methodBlock(service, 'private async probeDirectScpRoute', 'private scheduleDirectProbeCredentialCleanup');

		assert.deepStrictEqual({
			reusesPaneSessions: pairProbe.includes('this.getReusableDirectorySftpSession(connection)')
				&& pairProbe.includes('getReusableProbeSession(source.connection)')
				&& pairProbe.includes('getReusableProbeSession(target.connection)'),
			registersBeforeConnect: connect.indexOf('this.registerTransferCancelHandler(progressId') >= 0 && connect.indexOf('this.registerTransferCancelHandler(progressId') < connect.indexOf('client.connect('),
			cancelEndsClient: connect.includes('await abortSshClientAndWait(client);'),
			cancelRejectsTyped: connect.includes('reject(new TurboFileTransferCanceledError())'),
			keepsConnectedClientAlive: !routeProbe.includes('.end()') && routeProbe.includes('this.touchDirectorySftpSession(executorSession.key, executorSession.generation);'),
			credentialCleanupIsScheduled: routeProbe.includes('this.scheduleDirectProbeCredentialCleanup(executorSession, credential.identityPath, credential.activePath);')
		}, {
			reusesPaneSessions: true,
			registersBeforeConnect: true,
			cancelEndsClient: true,
			cancelRejectsTyped: true,
			keepsConnectedClientAlive: true,
			credentialCleanupIsScheduled: true
		});
	});

	test('reports first positive target growth without the steady-state progress delay', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const growthTiming = methodBlock(service, 'private beginTransferGrowthTiming', 'private normalizeGrowthProgressBytes');
		const remotePathGrowthTiming = methodBlock(service, 'private beginRemotePathGrowthTiming', 'private isTransferCanceled');
		const progress = methodBlock(service, 'private fireTransferProgress', 'private getTransferProgressEmitter');

		assert.deepStrictEqual({
			usesFastInitialPollOnlyUntilGrowth: service.includes('const TRANSFER_INITIAL_GROWTH_POLL_INTERVAL_MS = 50;')
				&& growthTiming.includes('let hasPositiveProgress = false;')
				&& growthTiming.includes('hasPositiveProgress = true;')
				&& growthTiming.includes('initialPollIntervalMs = TRANSFER_INITIAL_GROWTH_POLL_INTERVAL_MS')
				&& growthTiming.includes('hasPositiveProgress ? pollIntervalMs : Math.min(pollIntervalMs, initialPollIntervalMs)'),
			keepsExpensiveDirectoryGrowthAtTheSteadyCadence: remotePathGrowthTiming.includes('initialDelayMs, pollIntervalMs, onActivity);'),
			firstPositiveBypassesSteadyStateThrottle: progress.includes('const isFirstPositiveProgress = normalizedTransferred > 0')
				&& progress.includes('!isFirstPositiveProgress && !isCompletionEvent')
		}, {
			usesFastInitialPollOnlyUntilGrowth: true,
			keepsExpensiveDirectoryGrowthAtTheSteadyCadence: true,
			firstPositiveBypassesSteadyStateThrottle: true
		});
	});

	test('prewarms and reuses a capability-gated SSH control connection on direct hot paths', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const panePreparation = methodBlock(service, 'async prepareTransferPair', 'async transferFile');
		const transportPreparation = methodBlock(service, 'private async prepareDirectSshControlConnection', 'private getPreparedDirectSshControlPath');
		const pairProbe = methodBlock(service, 'private async runDirectScpProbePair', 'private async createEmptyRemoteProbeFile');
		const routeProbe = methodBlock(service, 'private async probeDirectScpRoute', 'private scheduleDirectProbeCredentialCleanup');
		const directScp = methodBlock(service, 'private async tryDirectScpTransferRoute', 'private async prepareRemoteScpCredential');
		const directSftp = methodBlock(service, 'private async tryDirectSftpTransferRoute', 'private async tryTunneledRsyncRelayTransfer');
		const directTar = methodBlock(service, 'private async tryDirectTarTransferRoute', 'private async tryDirectRsyncTransfer');
		const directRsync = methodBlock(service, 'private async tryDirectRsyncTransferRoute', 'private resolvePreparedDirectScpRoute');
		const directBatchTar = methodBlock(service, 'private async tryDirectBatchTarTransferRoute', 'private async tryRelayBatchTarTransfer');
		const directBatchRsync = methodBlock(service, 'private async tryDirectBatchRsyncTransferRoute', 'private async tryTunneledBatchRsyncRelayTransfer');
		const controlOptions = functionBlock(service, 'appendDirectSshControlOptions');
		const scpBuilder = functionBlock(service, 'buildDirectScpCommand');
		const sftpBuilder = functionBlock(service, 'buildOptimizedSftpCommand');
		const sshBuilder = functionBlock(service, 'buildDirectScpSshCommand');
		const rsyncBuilder = functionBlock(service, 'buildOptimizedRsyncSshCommand');
		const controlCheckBuilder = functionBlock(service, 'buildDirectSshControlCheckCommand');
		const credentialPreparation = methodBlock(service, 'private async prepareRemoteScpCredential', 'private async tryDirectSftpTransfer');
		const controlCache = methodBlock(service, 'private rememberDirectSshControlConnection', 'private resolvePreparedDirectScpRoute');
		const controlLease = methodBlock(service, 'private acquirePreparedDirectSshControlConnection', 'private getDirectSshControlConnectionKey');

		assert.deepStrictEqual({
			startsBothPhysicalDirectionsAlongsideProtocolProof: panePreparation.includes('this.prepareDirectSshControlConnection(sourceSession, targetConnection)')
				&& panePreparation.includes('this.prepareDirectSshControlConnection(targetSession, sourceConnection)')
				&& panePreparation.includes('const preparedControlPathsPromise = prepareControlConnections();')
				&& panePreparation.indexOf('preparedControlPathsPromise') < panePreparation.indexOf('getOrStartDirectScpProbePair')
				&& panePreparation.includes('const preparedControlPaths = await preparedControlPathsPromise;'),
			primaryProtocolBecomesReadyBeforeBackgroundFallbacks: panePreparation.includes('const primaryProtocol = protocols[0]')
				&& panePreparation.includes('await this.getOrStartDirectScpProbePair(source, target, primaryProtocol, true)')
				&& panePreparation.includes('void Promise.all(secondaryProtocols.map('),
			retriesOnlyTransientMissingControlConnectionsOffHotPath: panePreparation.includes('preparedControlPaths.some(controlPath => controlPath === undefined)')
				&& panePreparation.includes('DIRECT_SCP_PROBE_PREPARE_RETRY_MS')
				&& panePreparation.includes('controlPaths = await prepareControlConnections();')
				&& panePreparation.includes('this.directSshControlRetryPending.has(retryKey)')
				&& panePreparation.includes('this.directSshControlRetryPending.set(retryKey, retry)')
				&& panePreparation.includes('this.directSshControlRetryPending.delete(retryKey)')
				&& panePreparation.indexOf('const unresolved =') < panePreparation.indexOf('this.directSshControlRetryPending.has(retryKey)'),
			capabilityFailurePreservesLegacyProbe: transportPreparation.includes('return undefined;')
				&& transportPreparation.includes('this.rememberDirectSshControlConnection(')
				&& routeProbe.includes('this.acquirePreparedDirectSshControlConnection(executorSession, remoteConnection)'),
			concurrentPrewarmSharesOneControlHandshake: transportPreparation.includes('this.directSshControlConnectionPending.get(pendingKey)')
				&& transportPreparation.includes('this.directSshControlConnectionPending.set(pendingKey, started)')
				&& transportPreparation.includes('this.directSshControlConnectionPending.get(pendingKey) === started')
				&& transportPreparation.includes('this.directSshControlConnectionPending.delete(pendingKey)'),
			controlPathSurvivesPaneSessionRecycle: transportPreparation.includes('cached.generation === executorSession.generation')
				&& service.includes("createHash('sha256').update(executorSession.key).digest('hex')")
				&& service.includes('return `${executorFingerprint}=>${getDirectScpProbeConnectionKey(remoteConnection)}`;')
				&& !service.includes('forgetDirectSshControlConnectionsForSession'),
			boundedSecretFreeControlCache: service.includes('const DIRECT_SSH_CONTROL_CACHE_LIMIT = 64;')
				&& service.includes('this.directSshControlConnections.size > DIRECT_SSH_CONTROL_CACHE_LIMIT')
				&& !service.includes('return `${executorSession.key}=>${getDirectScpProbeConnectionKey(remoteConnection)}`;'),
			failedControlCapabilityUsesTypedRetryWindows: service.includes('const DIRECT_SSH_CONTROL_FAILURE_RETRY_MS = 200;')
				&& service.includes('const DIRECT_SSH_CONTROL_UNSUPPORTED_REFRESH_MS = 5 * 60 * 1000;')
				&& transportPreparation.includes('cached?.unsupported ? DIRECT_SSH_CONTROL_UNSUPPORTED_REFRESH_MS : DIRECT_SSH_CONTROL_FAILURE_RETRY_MS')
				&& transportPreparation.includes('return cached.unsupported ? false : cached.controlPath;'),
			failedValidationDoesNotAdvertiseDeadSocket: transportPreparation.includes('let verifiedDeadSocket = false;')
				&& transportPreparation.includes('verifiedDeadSocket = true;')
				&& transportPreparation.includes('existingAtStart?.controlPath && !verifiedDeadSocket')
				&& transportPreparation.includes('return existingAtStart.controlPath;'),
			backgroundPrewarmVerifiesRealMasterSocket: transportPreparation.includes('buildDirectSshControlCheckCommand(')
				&& controlCheckBuilder.includes("'-O check'")
				&& controlCheckBuilder.includes('`-S ${quotePosixShellArg(controlPath)}`')
				&& service.includes('const DIRECT_SSH_CONTROL_PREPARE_TIMEOUT_MS = 800;')
				&& transportPreparation.includes("${quotePosixShellArg('true')} </dev/null >/dev/null 2>&1")
				&& transportPreparation.includes('wrapRemoteCredentialCommand(establishCommand, credential.cleanupCommand, credential.activePath)')
				&& transportPreparation.includes('this.execRemoteBytes(executorSession.client, checkWithMarker, { timeoutMs: requireRemainingMs')
				&& transportPreparation.includes('this.execRemoteBytes(executorSession.client, command, { timeoutMs: requireRemainingMs')
				&& !transportPreparation.includes('`${establishCommand} && ${checkCommand}`'),
			capabilityCheckIsPortableAndStructured: transportPreparation.includes('ssh_version=$(ssh -V 2>&1 || true)')
				&& transportPreparation.includes('case "$ssh_version" in OpenSSH_*')
				&& transportPreparation.includes('unsupportedMarker')
				&& transportPreparation.includes('return false;')
				&& !transportPreparation.includes('| grep')
				&& transportPreparation.indexOf('const capabilityOutput =') < transportPreparation.indexOf('credential = await this.prepareRemoteScpCredential('),
			prewarmUsesOneEndToEndBudgetAndDeferredCleanup: transportPreparation.includes("requireRemainingMs('credential preparation')")
				&& transportPreparation.includes("requireRemainingMs('OpenSSH capability detection')")
				&& transportPreparation.includes("requireRemainingMs('connection establishment')")
				&& transportPreparation.includes("requireRemainingMs('validation')")
				&& credentialPreparation.includes("runWithinPreparationBudget('private key read'")
				&& credentialPreparation.includes('if (setupBudget <= 0)')
				&& credentialPreparation.includes('timeoutMs: setupBudget')
				&& credentialPreparation.includes('if (deferFailureCleanup)')
				&& credentialPreparation.includes('setTimeout(() => void cleanup(), DIRECT_SCP_PROBE_CLEANUP_DELAY_MS)'),
			newerSessionControlStateWinsEveryCacheRace: controlCache.includes('if (current && current.generation > entry.generation)')
				&& controlCache.indexOf('if (current && current.generation > entry.generation)') < controlCache.indexOf('this.directSshControlConnections.delete(cacheKey);'),
			processPrivateShortSocket: transportPreparation.includes('this.directSshControlInstanceId')
				&& transportPreparation.includes("'/tmp/tf-'")
				&& transportPreparation.includes("createHash('sha256')"),
			buildersGateMultiplexingByPreparedPath: controlOptions.includes("parts.push('-o ControlMaster=auto')")
				&& controlOptions.includes("parts.push('-o ControlPersist=300')")
				&& [scpBuilder, sftpBuilder, sshBuilder, rsyncBuilder].every(block => block.includes('controlPath?: string')
					&& block.includes('appendDirectSshControlOptions(parts, controlPath)')),
			singleDirectProtocolsReusePreparedTransport: [directScp, directSftp, directTar, directRsync].every(block => block.includes('this.acquirePreparedDirectSshControlConnection(executorLease.session, remote)')
				&& block.includes('controlLease.release();')),
			concurrentCommandsBypassTheBusyMaster: [directBatchTar, directBatchRsync].every(block => block.includes('this.acquirePreparedDirectSshControlConnection(executorLease.session, remote)')
				&& block.includes('controlLease.release();'))
				&& controlLease.includes('this.activeDirectSshControlConnections.has(cacheKey)')
				&& controlLease.includes('return { release: () => undefined };')
				&& controlLease.includes('this.activeDirectSshControlConnections.add(cacheKey)')
				&& controlLease.includes('this.activeDirectSshControlConnections.delete(cacheKey)'),
			controlPrewarmMarksAndCleansCredentialActivity: transportPreparation.includes('wrapRemoteCredentialCommand(')
				&& transportPreparation.includes('credential.cleanupCommand, credential.activePath)')
				&& transportPreparation.includes('this.scheduleDirectProbeCredentialCleanup(executorSession, credential.identityPath, credential.activePath);'),
			preparedControlProofTriesMuxBeforeStrictCredential: routeProbe.includes('const verification = await runProof({}, controlLease.controlPath);')
				&& routeProbe.indexOf('const verification = await runProof({}, controlLease.controlPath);') < routeProbe.indexOf('credential = await this.prepareRemoteScpCredential(')
				&& routeProbe.includes('controlLease.release();')
				&& routeProbe.includes('return await runProof(credential, undefined);'),
			realDataKeepsPrivateKeyFallback: !service.includes('credential = controlPath ? {} : await this.prepareRemoteScpCredential'),
			onlyScpProofSchedulesProbeFileCleanup: pairProbe.includes("if (protocol === 'scp')")
				&& pairProbe.indexOf("if (protocol === 'scp')") < pairProbe.indexOf('this.scheduleDirectScpProbeCleanup('),
			sourcePushPreparationPrecedesCredentialAndRetainedFallback: directScp.includes('this.prepareDirectTargetWithWarmSession(')
				&& directScp.indexOf('this.prepareDirectTargetWithWarmSession(') < directScp.indexOf('this.prepareRemoteScpCredential(')
				&& directScp.indexOf('this.prepareRemoteScpCredential(') < directScp.indexOf('const retainedPreparation = wrapRemoteCredentialCommand(')
				&& directScp.includes('credential.activePath, true')
		}, {
			startsBothPhysicalDirectionsAlongsideProtocolProof: true,
			primaryProtocolBecomesReadyBeforeBackgroundFallbacks: true,
			retriesOnlyTransientMissingControlConnectionsOffHotPath: true,
			capabilityFailurePreservesLegacyProbe: true,
			concurrentPrewarmSharesOneControlHandshake: true,
			controlPathSurvivesPaneSessionRecycle: true,
			boundedSecretFreeControlCache: true,
			failedControlCapabilityUsesTypedRetryWindows: true,
			failedValidationDoesNotAdvertiseDeadSocket: true,
			backgroundPrewarmVerifiesRealMasterSocket: true,
			capabilityCheckIsPortableAndStructured: true,
			prewarmUsesOneEndToEndBudgetAndDeferredCleanup: true,
			newerSessionControlStateWinsEveryCacheRace: true,
			processPrivateShortSocket: true,
			buildersGateMultiplexingByPreparedPath: true,
			singleDirectProtocolsReusePreparedTransport: true,
			concurrentCommandsBypassTheBusyMaster: true,
			controlPrewarmMarksAndCleansCredentialActivity: true,
			preparedControlProofTriesMuxBeforeStrictCredential: true,
			realDataKeepsPrivateKeyFallback: true,
			onlyScpProofSchedulesProbeFileCleanup: true,
			sourcePushPreparationPrecedesCredentialAndRetainedFallback: true
		});
	});

	test('keeps temporary direct credentials cancelable and cleanup-safe', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const wrapper = methodBlock(service, 'private async runPreparedDirectRouteAttempt<T>', 'private async resolveRemoteRsyncSshBinary');
		const routeProbe = methodBlock(service, 'private async probeDirectScpRoute', 'private scheduleDirectProbeCredentialCleanup');
		const batchTar = methodBlock(service, 'private async tryDirectBatchTarTransferRoute', 'private async tryRelayBatchTarTransfer');
		const directTar = methodBlock(service, 'private async tryDirectTarTransferRoute', 'private async tryDirectRsyncTransfer');
		const directScp = methodBlock(service, 'private async tryDirectScpTransferRoute', 'private async prepareRemoteScpCredential');
		const batchRsync = methodBlock(service, 'private async tryDirectBatchRsyncTransferRoute', 'private async tryTunneledBatchRsyncRelayTransfer');
		const directRsync = methodBlock(service, 'private async tryDirectRsyncTransferRoute', 'private resolvePreparedDirectScpRoute');
		const directSftp = methodBlock(service, 'private async tryDirectSftpTransferRoute', 'private async tryTunneledRsyncRelayTransfer');
		const credential = methodBlock(service, 'private async prepareRemoteScpCredential', 'private async tryDirectSftpTransfer');
		const exec = methodBlock(service, 'private execRemote(client: ISSHClient', 'private execRemoteBytes');
		const execBytes = methodBlock(service, 'private execRemoteBytes', 'private execRemoteWithInput');
		const credentialConsumers = [batchTar, directTar, directScp, batchRsync, directRsync, directSftp];

		assert.deepStrictEqual({
			preparedWrapperDoesNoNetworkWork: wrapper.includes('return await run(route);')
				&& !wrapper.includes('prepareRemoteScpCredential')
				&& !wrapper.includes('verifyDirectSshRoute')
				&& !wrapper.includes('execRemote'),
			strictBackgroundProbeRead: routeProbe.includes('this.prepareRemoteScpCredential(executorSession.client, remoteConnection, undefined, executorSession.sftp, true, token, credentialBudget)'),
			legacyFallback: credential.includes('strictPrivateKeyRead = false')
				&& credential.includes("runWithinPreparationBudget('private key read', () => this.readPrivateKey(remoteConnection.privateKeyPath)).catch(() => undefined)"),
			transferCallersNonStrict: credentialConsumers.every(block => block.includes('this.prepareRemoteScpCredential(client, remoteEndpoint.connection, request.progressId, executorLease.session.sftp)')
				|| block.includes('this.prepareRemoteScpCredential(client, remote, request.progressId, executorLease.session.sftp)')),
			checksCancelBeforeSetup: credential.indexOf('this.throwIfTransferCanceled(progressId);') > credential.indexOf('const privateKey =') && credential.indexOf('this.throwIfTransferCanceled(progressId);') < credential.indexOf('const identityPath ='),
			credentialCarriesActiveMarker: service.includes('readonly activePath?: string;')
				&& credential.includes('const activePath = `${identityPath}.active`;')
				&& credential.includes('buildPortablePosixRmMany([identityPath, activePath], false)')
				&& credential.includes('activePath,'),
			keepsClientsAliveForCleanup: credentialConsumers.every(block => !block.includes('registerTransferCancelHandler(request.progressId, () => client.end())')
				&& block.includes('this.scheduleDirectProbeCredentialCleanup(executorLease.session, credential.identityPath, credential.activePath);')),
			dataCommandsOwnCredentialCleanup: credentialConsumers.every(block => block.includes('wrapRemoteCredentialCommand(')
				&& block.includes('credential.cleanupCommand')
				&& block.includes('credential.activePath')),
			longPreprocessingFinishesBeforeCredentialSetup: directScp.indexOf('this.prepareDirectTargetWithWarmSession(') < directScp.indexOf('this.prepareRemoteScpCredential(')
				&& directSftp.indexOf('const sourceType =') < directSftp.indexOf('this.prepareRemoteScpCredential(')
				&& directSftp.indexOf('this.prepareDirectTargetWithWarmSession(') < directSftp.indexOf('this.prepareRemoteScpCredential(')
				&& batchTar.indexOf('const usePreparedTarget =') < batchTar.indexOf('this.prepareRemoteScpCredential(')
				&& batchTar.indexOf('this.prepareRemoteBatchTarTarget(') < batchTar.indexOf('this.prepareRemoteScpCredential(')
				&& directRsync.indexOf('const sourceType =') < directRsync.indexOf('this.prepareRemoteScpCredential(')
				&& directRsync.indexOf('this.resolveRemoteRsyncSshBinary(') < directRsync.indexOf('this.prepareRemoteScpCredential('),
			cancelableDataExec: batchTar.includes('progressId: request.progressId') && directTar.includes('progressId: request.progressId') && (directScp.match(/progressId: request\.progressId/g)?.length ?? 0) >= 2,
			execPrechecksCancellation: [exec, execBytes].every(block => {
				const precheck = block.indexOf('this.throwIfTransferCanceled(options.progressId);');
				return precheck >= 0
					&& precheck < block.indexOf('this.registerTransferCancelHandler(options.progressId')
					&& precheck < block.indexOf('client.exec(');
			})
		}, {
			preparedWrapperDoesNoNetworkWork: true,
			strictBackgroundProbeRead: true,
			legacyFallback: true,
			transferCallersNonStrict: true,
			checksCancelBeforeSetup: true,
			credentialCarriesActiveMarker: true,
			keepsClientsAliveForCleanup: true,
			dataCommandsOwnCredentialCleanup: true,
			longPreprocessingFinishesBeforeCredentialSetup: true,
			cancelableDataExec: true,
			execPrechecksCancellation: true
		});
	});

	test('bounds direct validation cancellation and credential cleanup', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const batchTar = methodBlock(service, 'private async tryDirectBatchTarTransferRoute', 'private async tryRelayBatchTarTransfer');
		const directTar = methodBlock(service, 'private async tryDirectTarTransferRoute', 'private async tryDirectRsyncTransfer');
		const directScp = methodBlock(service, 'private async tryDirectScpTransferRoute', 'private async prepareRemoteScpCredential');
		const remoteSize = methodBlock(service, 'private async getRemotePathSize(sftp:', 'private async getRemotePathSizeByCommand');
		const remoteSizeByCommand = methodBlock(service, 'private async getRemotePathSizeByCommand', 'private async getRemotePathContentSizeByCommand');
		const remoteContentSizeByCommand = methodBlock(service, 'private async getRemotePathContentSizeByCommand', 'private async getPathHumanSize');
		const cleanupScheduler = methodBlock(service, 'private scheduleDirectProbeCredentialCleanup', 'private scheduleDirectScpProbeCleanup');
		const credentialWrapper = functionBlock(service, 'wrapRemoteCredentialCommand');
		const tarValidation = directTar.indexOf('const targetSize = await this.getRemotePathContentSizeByCommand(request.target, request.progressId)');
		const tarPostcheck = directTar.indexOf('this.throwIfTransferCanceled(request.progressId);', tarValidation);
		const scpValidation = directScp.indexOf('const targetSize = await this.withDirectorySftp(request.target');
		const scpPostcheck = directScp.indexOf('this.throwIfTransferCanceled(request.progressId);', scpValidation);
		const cleanup = 'this.scheduleDirectProbeCredentialCleanup(executorLease.session, credential.identityPath, credential.activePath);';

		assert.deepStrictEqual({
			batchTarPostchecksDataCommand: batchTar.indexOf('this.throwIfTransferCanceled(request.progressId);') > batchTar.indexOf('await this.execRemote(client, command'),
			directTarPostchecksValidation: tarValidation >= 0 && tarPostcheck > tarValidation && tarPostcheck < directTar.indexOf('if (targetSize !== expectedBytes)'),
			directScpPostchecksValidation: scpValidation >= 0 && scpPostcheck > scpValidation && scpPostcheck < directScp.indexOf('if (targetSize !== bytes)'),
			sizeHelpersPropagateCancellation: remoteSize.includes('progressId?: string')
				&& (remoteSize.match(/this\.throwIfTransferCanceled\(progressId\);/g)?.length ?? 0) >= 4
				&& remoteSize.includes('this.getRemotePathSize(sftp, joinRemotePath(remotePath, entry.filename), progressId)')
				&& remoteSizeByCommand.includes('progressId?: string')
				&& remoteSizeByCommand.includes('buildWindowsSizeCommand(endpoint.path)')
				&& remoteSizeByCommand.includes('buildPosixSizeCommand(endpoint.path)')
				&& (remoteSizeByCommand.match(/this\.execRemoteBytes\(client, command, \{ progressId \}\)/g)?.length ?? 0) === 2
				&& remoteSizeByCommand.includes('this.getRemotePathSize(sftp, endpoint.path, progressId)')
				&& remoteContentSizeByCommand.includes('progressId?: string')
				&& remoteContentSizeByCommand.includes('this.getRemotePathSizeByCommand(endpoint, progressId)')
				&& remoteContentSizeByCommand.includes('this.execRemoteBytes(client, buildPosixContentSizeCommand(endpoint.path), { progressId })')
				&& remoteContentSizeByCommand.includes('this.getRemotePathSize(sftp, endpoint.path, progressId)'),
			cleanupUsesTheExistingSftpSubsystem: [batchTar, directTar, directScp].every(block => block.includes(cleanup))
				&& cleanupScheduler.includes('this.unlinkRemoteBestEffort(candidate.sftp, identityPath)')
				&& cleanupScheduler.includes('activePath ? this.unlinkRemoteBestEffort(candidate.sftp, activePath) : Promise.resolve(true)')
				&& !cleanupScheduler.includes('this.execRemote(')
				&& cleanupScheduler.includes('if (cleaned)')
				&& cleanupScheduler.includes('const currentPromise = this.directorySftpSessions.get(session.key)')
				&& cleanupScheduler.includes('DIRECT_SCP_PROBE_BACKGROUND_TIMEOUT_MS + DIRECT_SCP_PROBE_CLEANUP_DELAY_MS'),
			credentialTrapRunsOnNormalAndInterruptedExit: credentialWrapper.includes('const markActive = activePath')
				&& credentialWrapper.includes('printf \'%s\\\\n\' "$$" > ${quotePosixShellArg(activePath)}')
				&& credentialWrapper.includes('trap ${quotePosixShellArg(releaseCommand)} 0;')
				&& credentialWrapper.includes('trap - 0 HUP INT TERM; ${releaseCommand}; exit ${exitCode}')
				&& credentialWrapper.includes('signalCleanup(129)')
				&& credentialWrapper.includes('signalCleanup(130)')
				&& credentialWrapper.includes('signalCleanup(143)')
		}, {
			batchTarPostchecksDataCommand: true,
			directTarPostchecksValidation: true,
			directScpPostchecksValidation: true,
			sizeHelpersPropagateCancellation: true,
			cleanupUsesTheExistingSftpSubsystem: true,
			credentialTrapRunsOnNormalAndInterruptedExit: true
		});
	});

	test('uses prepared auto-fast routes and shares cold single-flight preparation', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const transfer = methodBlock(service, 'private async transferBetweenSshDevices', 'private async trySshToSshTransferAttempt');
		const directDispatcher = methodBlock(service, 'private async trySshToSshDirectTransfer', 'private async trySshToSshRelayTransfer');
		const directRsync = methodBlock(service, 'private async tryDirectRsyncTransfer', 'private async tryDirectRsyncTransferRoute');
		const directTar = methodBlock(service, 'private async tryDirectTarTransfer', 'private async tryDirectTarTransferRoute');
		const directScp = methodBlock(service, 'private async tryDirectScpTransfer', 'private async tryDirectScpTransferRoute');
		const directSftp = methodBlock(service, 'private async tryDirectSftpTransfer', 'private async tryDirectSftpTransferRoute');
		const preparedDecision = methodBlock(service, 'private resolvePreparedDirectScpRoute', 'private resolvePreparedDirectAttempts');
		const preparedSelector = methodBlock(service, 'private resolvePreparedDirectAttempts', 'private getOrStartDirectScpProbePair');

		assert.deepStrictEqual({
			allDirectProtocolsCanSelectPreparedRoute: transfer.includes('await this.resolveOrPrepareDirectAttempts(effectiveRequest.source, effectiveRequest.target, plan.attempts, preparedDirectRoute)')
				&& preparedSelector.includes("if (attempt.route !== 'direct')")
				&& preparedSelector.includes('getPreparedDirectRouteProtocol(attempt)')
				&& preparedSelector.includes('prepared.push('),
			explicitDirectAlsoUsesPaneDecision: transfer.includes("request.strategyHint !== 'relay'")
				&& !transfer.includes("request.strategyHint !== 'direct'"),
			preparedDecision: preparedSelector.includes('this.resolvePreparedDirectScpRoute(source, target, probeProtocol)')
				&& !preparedSelector.includes('await this.resolvePreparedDirectScpRoute'),
			coldCacheMissSharesPreparation: preparedDecision.includes("return { kind: 'unknown' };")
				&& preparedSelector.includes('unknownProtocols.map(protocol => this.getOrStartDirectScpProbePair(source, target, protocol))'),
			capabilityChangesSkipStalePreparedProtocols: preparedSelector.includes('isPreparedDirectRouteProtocolSupported(source, target, probeProtocol)'),
			inheritedRoutesRequireCurrentSnapshot: preparedSelector.includes('inherited.route === decision.route')
				&& preparedSelector.includes('inherited.generation === decision.generation')
				&& preparedSelector.indexOf('this.resolvePreparedDirectScpRoute(source, target, probeProtocol)') < preparedSelector.indexOf('inherited?.probeProtocol === probeProtocol'),
			noDirectProbeProgress: !transfer.includes('Checking direct') && !transfer.includes('getOrStartDirectScpProbePair') && !transfer.includes('probeDirectScpRoute'),
			relaySkipsEveryDirectAttempt: transfer.includes("effectiveRequest = { ...effectiveRequest, strategyHint: 'relay' }") && transfer.includes('strategyHint: effectiveRequest.strategyHint'),
			verifiedPlanStartsSelectedDirectBeforeRelays: transfer.includes("attempts: [...selected.map(prepared => prepared.attempt), ...plan.attempts.filter(attempt => attempt.route === 'relay')]"),
			firstEventIncludesPreparedDirection: transfer.includes("route: attempt.route === 'relay' ? 'relay' : selectedPreparedRoute?.route"),
			directFallbackKeepsPreparedDirection: transfer.includes('const nextPreparedRoute = preparedDirectRoutes.get(nextAttempt);')
				&& transfer.includes("route: nextAttempt.route === 'relay' ? 'relay' : nextPreparedRoute?.route"),
			passesPreparedRouteToEveryProtocol: ['tryDirectRsyncTransfer(request, startedAt, true, preverifiedDirectRoute)', 'tryDirectTarTransfer(request, startedAt, true, preverifiedDirectRoute)', 'tryDirectSftpTransfer(request, startedAt, true, preverifiedDirectRoute)', 'tryDirectScpTransfer(request, startedAt, true, preverifiedDirectRoute)'].every(call => directDispatcher.includes(call)),
			allDirectMethodsRequirePreparedRoute: [directRsync, directTar, directScp, directSftp].every(block => block.includes('runPreparedDirectRouteAttempt') && !block.includes('runVerifiedDirectRouteAttempt')),
			legacyTransferVerifierRemoved: !service.includes('runVerifiedDirectRouteAttempt') && !service.includes('verifyDirectSshRoute'),
			failedTopologyRouteIsForgotten: transfer.includes("if (attempt.route === 'direct' && selectedPreparedRoute && shouldInvalidatePreparedDirectRoute(error)) {")
				&& transfer.includes('selectedPreparedRoute.probeProtocol, selectedPreparedRoute.route')
		}, {
			allDirectProtocolsCanSelectPreparedRoute: true,
			explicitDirectAlsoUsesPaneDecision: true,
			preparedDecision: true,
			coldCacheMissSharesPreparation: true,
			capabilityChangesSkipStalePreparedProtocols: true,
			inheritedRoutesRequireCurrentSnapshot: true,
			noDirectProbeProgress: true,
			relaySkipsEveryDirectAttempt: true,
			verifiedPlanStartsSelectedDirectBeforeRelays: true,
			firstEventIncludesPreparedDirection: true,
			directFallbackKeepsPreparedDirection: true,
			passesPreparedRouteToEveryProtocol: true,
			allDirectMethodsRequirePreparedRoute: true,
			legacyTransferVerifierRemoved: true,
			failedTopologyRouteIsForgotten: true
		});
	});

	test('uses prepared auto-fast routes and shares batch cold preparation', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const transferBatchCore = methodBlock(service, 'private async transferBatchCore', 'private getBatchExpectedBytes');
		const batchPlan = methodBlock(service, 'private async runSshToSshBatchTransferPlan', 'private async runSshToSshBatchTransferAttempt');
		const batchAttempt = methodBlock(service, 'private async runSshToSshBatchTransferAttempt', 'private async runLocalNativeBatchTransfer');
		const batchTar = methodBlock(service, 'private async tryBatchTarTransfer', 'private createRemoteBatchTarPlan');
		const directTar = methodBlock(service, 'private async tryDirectTarTransfer', 'private async tryDirectTarTransferRoute');
		const directBatchTar = methodBlock(service, 'private async tryDirectBatchTarTransfer', 'private async tryDirectBatchTarTransferRoute');
		const directBatchRsync = methodBlock(service, 'private async tryDirectBatchRsyncTransfer', 'private async tryDirectBatchRsyncTransferRoute');
		const directBatchRsyncRoute = methodBlock(service, 'private async tryDirectBatchRsyncTransferRoute', 'private async tryTunneledBatchRsyncRelayTransfer');
		const directRsyncRoute = methodBlock(service, 'private async tryDirectRsyncTransferRoute', 'private resolvePreparedDirectScpRoute');
		const directSftpRoute = methodBlock(service, 'private async tryDirectSftpTransferRoute', 'private async tryTunneledRsyncRelayTransfer');
		const concurrentBatch = methodBlock(service, 'private async runConcurrentBatchTransfer', 'private async runSftpRelayTransfer');
		const batchRelayTar = methodBlock(service, 'private async tryRelayBatchTarTransfer', 'private async runConcurrentBatchTransfer');
		const singleRelayTar = methodBlock(service, 'private async tryTarRelayTransfer', 'private async tryStreamRelayTransfer');
		const credentialWrapper = functionBlock(service, 'wrapRemoteCredentialCommand');

		assert.deepStrictEqual({
			multiFileUsesActualPlanDecision: batchPlan.includes('await this.resolveOrPrepareDirectAttempts(request.source, request.targetDirectory, plan.attempts, preparedDirectRoute)'),
			explicitDirectAlsoUsesPaneDecision: batchPlan.includes("request.strategyHint !== 'relay'")
				&& !batchPlan.includes("request.strategyHint !== 'direct'"),
			preparedDecision: batchPlan.includes('await this.resolveOrPrepareDirectAttempts(request.source, request.targetDirectory, plan.attempts, preparedDirectRoute)'),
			noDirectProbeProgress: !transferBatchCore.includes('Checking direct'),
			sshRsyncDoesNotPublishPlannedDirectStrategy: transferBatchCore.includes("const initialIsRsync = initialAttempt?.protocol === 'rsync' && !sshToSsh;"),
			relaySkipsEveryDirectAttempt: batchPlan.includes("strategyHint: 'relay'")
				&& batchPlan.includes('resolveTransferPlan({'),
			verifiedPlanStartsSelectedDirectBeforeRelays: batchPlan.includes("? [...selected.map(prepared => prepared.attempt), ...plan.attempts.filter(attempt => attempt.route === 'relay')]"),
			firstEventIncludesPreparedDirection: batchPlan.includes("route: attempt.route === 'relay' ? 'relay' : selectedPreparedRoute?.route"),
			directFallbackKeepsPreparedDirection: batchPlan.includes('const nextPreparedRoute = preparedDirectRoutes.get(nextAttempt);')
				&& batchPlan.includes("route: nextAttempt.route === 'relay' ? 'relay' : nextPreparedRoute?.route"),
			passesPreparedRoute: batchPlan.includes('const selectedPreparedRoute = preparedDirectRoutes.get(attempt);')
				&& batchPlan.includes('attempt, selectedPreparedRoute')
				&& batchAttempt.includes('preparedDirectRoute?: IPreparedDirectRoute')
				&& batchAttempt.includes('preparedDirectRoute?.route'),
			directTarSkipsLegacyVerification: batchTar.includes('this.tryDirectBatchTarTransfer(request, items, plan, bytes, startedAt, preverifiedDirectRoute)')
				&& directBatchTar.includes('this.runPreparedDirectRouteAttempt(preparedRoute')
				&& !directBatchTar.includes('runVerifiedDirectRouteAttempt'),
			directRsyncSkipsLegacyVerification: directBatchRsync.includes('this.runPreparedDirectRouteAttempt(preparedRoute')
				&& batchAttempt.includes('this.tryDirectBatchRsyncTransfer(request, items, expectedBytes, startedAt, true, preparedDirectRoute?.route)'),
			privateKeyCredentialsReachEveryDirectProtocol: [directBatchRsyncRoute, directRsyncRoute].every(block => block.includes('this.prepareRemoteScpCredential(client, remote, request.progressId, executorLease.session.sftp)')
				&& block.includes('credential.identityPath')
				&& block.includes('credential.cleanupCommand')
				&& block.includes('credential.activePath'))
				&& directSftpRoute.includes('buildOptimizedSftpCommand(remote.port || 22, !!remote.password, credential.identityPath, controlPath)')
				&& directSftpRoute.includes('buildCompatibleSshCommand(remote.port || 22, !!remote.password, credential.identityPath, controlPath)')
				&& directSftpRoute.includes('credential.cleanupCommand, credential.activePath'),
			batchRsyncMarksEveryGroupAndOnlyRetainsIntermediateCredentials: directBatchRsyncRoute.includes('const executableCommand = wrapRemoteCredentialCommand(')
				&& directBatchRsyncRoute.includes('credential.activePath,')
				&& directBatchRsyncRoute.includes('groupIndex < sourceGroups.length - 1')
				&& !directBatchRsyncRoute.includes("groupIndex === sourceGroups.length - 1\n\t\t\t\t\t? wrapRemoteCredentialCommand")
				&& credentialWrapper.includes('retainCredential && activePath')
				&& credentialWrapper.includes('buildPortablePosixRm(activePath, false)')
				&& credentialWrapper.includes(': cleanupCommand;'),
			concurrentChildrenReusePreparedRoute: batchAttempt.includes("}, items, 'copy', expectedBytes, startedAt, false, preparedDirectRoute)")
				&& concurrentBatch.includes('}, preserveDirectErrors, preparedDirectRoute);'),
			singleDirectoryTarSkipsLegacyVerification: directTar.includes('preverifiedDirectRoute?: TurboFileDirectSshRoute')
				&& directTar.includes('this.runPreparedDirectRouteAttempt(preverifiedDirectRoute'),
			failedTopologyRouteIsForgotten: batchPlan.includes("if (attempt.route === 'direct' && selectedPreparedRoute && shouldInvalidatePreparedDirectRoute(error)) {")
				&& batchPlan.includes('selectedPreparedRoute.probeProtocol, selectedPreparedRoute.route'),
			warmParallelRelayStreams: batchRelayTar.includes('await this.acquireTransferSessionPair(request.source, request.targetDirectory, request.progressId)')
				&& batchRelayTar.includes('const [sourceStream, targetStream] = await Promise.all([')
				&& batchRelayTar.includes('sourceLease.release();')
				&& batchRelayTar.includes('targetLease.release();')
				&& singleRelayTar.includes('await Promise.all([')
				&& singleRelayTar.includes('this.acquireTransferSessionPair(request.source, request.target, request.progressId)')
				&& !batchRelayTar.includes('sourceClient?.end()')
				&& !singleRelayTar.includes('sourceClient?.end()')
		}, {
			multiFileUsesActualPlanDecision: true,
			explicitDirectAlsoUsesPaneDecision: true,
			preparedDecision: true,
			noDirectProbeProgress: true,
			sshRsyncDoesNotPublishPlannedDirectStrategy: true,
			relaySkipsEveryDirectAttempt: true,
			verifiedPlanStartsSelectedDirectBeforeRelays: true,
			firstEventIncludesPreparedDirection: true,
			directFallbackKeepsPreparedDirection: true,
			passesPreparedRoute: true,
			directTarSkipsLegacyVerification: true,
			directRsyncSkipsLegacyVerification: true,
			privateKeyCredentialsReachEveryDirectProtocol: true,
			batchRsyncMarksEveryGroupAndOnlyRetainsIntermediateCredentials: true,
			concurrentChildrenReusePreparedRoute: true,
			singleDirectoryTarSkipsLegacyVerification: true,
			failedTopologyRouteIsForgotten: true,
			warmParallelRelayStreams: true
		});
	});

	test('invalidates a prepared direct route only for topology and connection failures', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const invalidation = functionBlock(service, 'shouldInvalidatePreparedDirectRoute');

		assert.deepStrictEqual({
			directUnavailableInvalidates: invalidation.includes('error instanceof TurboFileDirectUnavailableError'),
			unwrapsDirectDataCause: invalidation.includes('error instanceof TurboFileDirectDataError ? error.transferCause : error'),
			connectionFailuresInvalidate: ['authentication', 'protocol-unavailable', 'direct-unavailable', 'network-transient'].every(category => invalidation.includes(`category === '${category}'`)),
			dataAndTargetFailuresStayPrepared: ['permission', 'conflict', 'no-space', 'integrity', 'unknown'].every(category => !invalidation.includes(`category === '${category}'`))
		}, {
			directUnavailableInvalidates: true,
			unwrapsDirectDataCause: true,
			connectionFailuresInvalidate: true,
			dataAndTargetFailuresStayPrepared: true
		});
	});

	test('uses protocol-matched pane probes with persistent bidirectional decisions', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const preparedCache = fs.readFileSync(path.join(process.cwd(), 'src/vs/platform/turbofile/common/turbofilePreparedDirectRouteCache.ts'), 'utf8');
		const panePreparation = methodBlock(service, 'async prepareTransferPair', 'async transferFile');
		const resolver = methodBlock(service, 'private resolvePreparedDirectScpRoute', 'private getOrStartDirectScpProbePair');
		const probeStarter = methodBlock(service, 'private getOrStartDirectScpProbePair', 'private async runDirectScpProbePair');
		const pairProbe = methodBlock(service, 'private async runDirectScpProbePair', 'private async createEmptyRemoteProbeFile');
		const prepareProbe = methodBlock(service, 'private async createEmptyRemoteProbeFile', 'private async probeDirectScpRoute');
		const routeProbe = methodBlock(service, 'private async probeDirectScpRoute', 'private scheduleDirectProbeCredentialCleanup');
		const credentialCleanup = methodBlock(service, 'private scheduleDirectProbeCredentialCleanup', 'private scheduleDirectScpProbeCleanup');
		const cleanup = methodBlock(service, 'private scheduleDirectScpProbeCleanup', 'private getCachedDirectScpProbeRoute');
		const routePersistence = methodBlock(service, 'private restorePersistedDirectRoutes', 'private getCachedDirectScpProbeRoute');
		const prepareCredential = methodBlock(service, 'private async prepareRemoteScpCredential', 'private async tryDirectSftpTransfer');
		const bestEffortUnlink = methodBlock(service, 'private async unlinkRemoteBestEffort', 'private async uploadDirectory');
		const cachedRoute = methodBlock(service, 'private getCachedDirectScpProbeRoute', 'private rememberDirectScpProbeRoute');
		const rememberRoute = methodBlock(service, 'private rememberDirectScpProbeRoute', 'private rememberDirectScpProbeUnavailable');
		const forgetRoute = methodBlock(service, 'private forgetDirectScpProbeRoute', 'private async runPreparedDirectRouteAttempt');
		const command = functionBlock(service, 'buildDirectScpProbeCommand');
		const tarCommand = functionBlock(service, 'buildDirectTarProbeCommand');
		assert.ok(tarCommand.includes("buildPipefailBashCommand('true')"));
		const rsyncCommand = functionBlock(service, 'buildDirectRsyncProbeCommand');
		const sftpCommand = functionBlock(service, 'buildDirectSftpProbeCommand');
		const credentialWrapper = functionBlock(service, 'wrapRemoteCredentialCommand');
		const preparedProtocols = functionBlock(service, 'getPreparedDirectRouteProtocols');
		const connectionKey = functionBlock(service, 'getDirectScpProbeConnectionKey');
		const pairKey = functionBlock(service, 'getDirectScpProbePairKey');

		assert.deepStrictEqual({
			cacheMissStaysUnknown: resolver.includes(': PreparedDirectRouteDecision')
				&& resolver.includes("return { kind: 'unknown' };")
				&& resolver.includes('private async resolveOrPrepareDirectAttempts'),
			foregroundSharesSingleFlight: resolver.includes('const pending = unknownProtocols.map(protocol => this.getOrStartDirectScpProbePair(source, target, protocol))')
				&& resolver.includes('this.resolvePreparedDirectAttempts(source, target, attempts, inherited).length')
				&& !resolver.includes('Direct route preparation remained indeterminate after bounded retries.'),
			paneRetriesOnlyIndeterminateProbes: panePreparation.includes('DIRECT_SCP_PROBE_PREPARE_ATTEMPTS')
				&& panePreparation.includes('DIRECT_SCP_PROBE_PREPARE_RETRY_MS')
				&& panePreparation.includes('this.getOrStartDirectScpProbePair(source, target, primaryProtocol, true)')
				&& panePreparation.includes('throw new Error(`Direct route preparation is still pending'),
			primaryProtocolFinishesFirst: panePreparation.includes('const primaryProtocol = protocols[0];')
				&& panePreparation.includes('const secondaryProtocols = protocols.slice(1).filter('),
			secondaryProtocolsRunInBackground: panePreparation.includes('void Promise.all(secondaryProtocols.map(protocol => this.getOrStartDirectScpProbePair(source, target, protocol, true)))'),
			staleDecisionsRefreshOnlyInBackground: panePreparation.includes('this.preparedDirectRouteCache.needsRefresh(')
				&& panePreparation.includes('DIRECT_ROUTE_BACKGROUND_REFRESH_MS'),
			backgroundHasIndependentLimit: pairProbe.includes('DIRECT_SCP_PROBE_BACKGROUND_TIMEOUT_MS') && pairProbe.includes('coordinateTurboFileDirectRouteProbe'),
			preservesCoordinatorAvailabilityDistinction: pairProbe.includes('{ ...decision, sourceSession, targetSession }')
				&& !pairProbe.includes('confirmedUnavailable: true')
				&& probeStarter.includes('else if (outcome.confirmedUnavailable && outcome.sourceSession && outcome.targetSession)')
				&& probeStarter.includes('this.rememberDirectScpProbeUnavailable('),
			reusesBothPaneSessions: pairProbe.includes('this.getReusableDirectorySftpSession(connection)')
				&& pairProbe.includes('getReusableProbeSession(source.connection)')
				&& pairProbe.includes('getReusableProbeSession(target.connection)'),
			restoresLateSessionIdleTimers: pairProbe.includes('this.touchDirectorySftpSession(session.key, session.generation);'),
			isolatedTemporaryPaths: pairProbe.includes('/tmp/.turbofile-scp-probe-${nonce}-source') && pairProbe.includes('/tmp/.turbofile-scp-probe-${nonce}-push') && pairProbe.includes('/tmp/.turbofile-scp-probe-${nonce}-pull'),
			latePreparationIsUnlinked: prepareProbe.includes("await this.execRemote(session.client, `umask 077; : > ${quotePosixShellArg(path)}`")
				&& prepareProbe.includes('void this.unlinkRemoteBestEffort(session.sftp, path);')
				&& !prepareProbe.includes('this.execRemote(session.client, `rm -f'),
			realScpCommand: command.includes('buildDirectScpCommand(')
				&& command.includes('DIRECT_ROUTE_PROBE_CONNECT_TIMEOUT_SECONDS')
				&& command.includes('buildSshpassPrefix(remote.password)')
				&& command.includes('sourceProbePath')
				&& command.includes('sourcePushTargetPath')
				&& command.includes('targetPullTargetPath')
				&& !command.includes('buildDirectScpSshCommand(')
				&& !command.includes('buildPortablePosix'),
			matchedTarCommand: routeProbe.includes("protocol === 'scp'")
				&& routeProbe.includes('buildDirectTarProbeCommand(remoteConnection, proofCredential.identityPath, marker, controlPath)')
				&& tarCommand.includes('buildDirectScpSshCommand(')
				&& tarCommand.includes('DIRECT_ROUTE_PROBE_CONNECT_TIMEOUT_SECONDS')
				&& tarCommand.includes('buildDirectTarProgressPrerequisiteCommand()')
				&& tarCommand.includes('command -v bash')
				&& tarCommand.includes('command -v tar')
				&& tarCommand.includes("const remotePrerequisites = 'command -v tar >/dev/null 2>&1';")
				&& !tarCommand.includes('dialectPath')
				&& !tarCommand.includes('buildPortablePosix'),
			matchedRsyncAndSftpCommands: routeProbe.includes("protocol === 'rsync'")
				&& routeProbe.includes('buildDirectRsyncProbeCommand(remoteConnection, proofCredential.identityPath, marker, controlPath)')
				&& routeProbe.includes('buildDirectSftpProbeCommand(remoteConnection, proofCredential.identityPath, marker, controlPath)')
				&& rsyncCommand.includes('command -v rsync')
				&& rsyncCommand.includes('buildDirectScpSshCommand(')
				&& rsyncCommand.includes('DIRECT_ROUTE_PROBE_CONNECT_TIMEOUT_SECONDS')
				&& !rsyncCommand.includes('dialectPath')
				&& !rsyncCommand.includes('buildPortablePosix')
				&& sftpCommand.includes('buildOptimizedSftpCommand(')
				&& sftpCommand.includes('DIRECT_ROUTE_PROBE_CONNECT_TIMEOUT_SECONDS')
				&& !sftpCommand.includes('buildDirectScpSshCommand(')
				&& !sftpCommand.includes('dialectPath')
				&& !sftpCommand.includes('buildPortablePosix')
				&& sftpCommand.includes("printf 'quit\\\\n'"),
			preparesOnlyPlannedDirectProtocols: preparedProtocols.includes('resolveTransferPlan({ source, target, ...shape })')
				&& preparedProtocols.includes("if (attempt.route !== 'direct')")
				&& preparedProtocols.includes('isPreparedDirectRouteProtocolSupported(source, target, attempt.protocol)')
				&& preparedProtocols.includes('protocols.add(attempt.protocol)'),
			windowsPathsSkipEveryPosixProbe: preparedProtocols.includes('if (looksLikeWindowsPath(source.path) || looksLikeWindowsPath(target.path))')
				&& preparedProtocols.indexOf('return [];') < preparedProtocols.indexOf('resolveTransferPlan({ source, target, ...shape })')
				&& panePreparation.includes('const protocols = getPreparedDirectRouteProtocols(source, target);')
				&& panePreparation.includes('if (!protocols.length)')
				&& panePreparation.indexOf('if (!protocols.length)') < panePreparation.indexOf('this.prepareDirectSshControlConnection('),
			allPlannedDirectProtocolsAreCollected: preparedProtocols.includes('for (const attempt of resolveTransferPlan({ source, target, ...shape }).attempts)')
				&& !preparedProtocols.includes('.attempts.find('),
			noSerialPingBeforeProtocolProof: !service.includes('probeDirectNetworkReachability')
				&& !service.includes('buildDirectPingProbeCommand')
				&& routeProbe.includes('execRemoteBytes(executorSession.client, command, { timeoutMs: remainingMs, token })'),
			noBusinessPaths: !command.includes('request.source.path') && !command.includes('request.target.path'),
			privateKeyParity: routeProbe.includes('prepareRemoteScpCredential(executorSession.client, remoteConnection, undefined, executorSession.sftp, true, token, credentialBudget)') && routeProbe.includes('proofCredential.identityPath'),
			boundedCredentialSetup: routeProbe.includes('const credentialBudget = Math.max(0, DIRECT_SCP_PROBE_BACKGROUND_TIMEOUT_MS')
				&& service.includes('const REMOTE_SCP_CREDENTIAL_SETUP_TIMEOUT_MS = 10 * 1000;')
				&& prepareCredential.includes("runWithinPreparationBudget('private key read'")
				&& prepareCredential.includes('if (setupBudget <= 0)')
				&& prepareCredential.includes('timeoutMs: setupBudget'),
			cancelableExec: routeProbe.includes('execRemoteBytes(executorSession.client, command, { timeoutMs: remainingMs, token })'),
			credentialCommandCarriesItsOwnTrap: routeProbe.includes('const command = wrapRemoteCredentialCommand(')
				&& routeProbe.includes('proofCredential.cleanupCommand, proofCredential.activePath)')
				&& credentialWrapper.includes('printf \'%s\\\\n\' "$$" > ${quotePosixShellArg(activePath)}')
				&& credentialWrapper.includes('trap ${quotePosixShellArg(releaseCommand)} 0;')
				&& credentialWrapper.includes('trap - 0 HUP INT TERM; ${releaseCommand}; exit ${exitCode}'),
			credentialCleanupRetriesOnlyAfterFailure: credentialCleanup.includes('void cleanup(session).then(cleaned => {')
				&& credentialCleanup.includes('this.unlinkRemoteBestEffort(candidate.sftp, identityPath)')
				&& credentialCleanup.includes('activePath ? this.unlinkRemoteBestEffort(candidate.sftp, activePath) : Promise.resolve(true)')
				&& !credentialCleanup.includes('this.execRemote(')
				&& credentialCleanup.includes('if (cleaned)')
				&& credentialCleanup.includes('const currentPromise = this.directorySftpSessions.get(session.key)')
				&& credentialCleanup.includes('DIRECT_SCP_PROBE_BACKGROUND_TIMEOUT_MS + DIRECT_SCP_PROBE_CLEANUP_DELAY_MS'),
			failedCredentialSetupUsesExistingSftp: prepareCredential.includes('cleanupSftp?: ISFTPWrapper')
				&& prepareCredential.includes('const cleanup = () => cleanupSftp')
				&& prepareCredential.includes('this.unlinkRemoteBestEffort(cleanupSftp, identityPath)')
				&& prepareCredential.includes('this.unlinkRemoteBestEffort(cleanupSftp, activePath)')
				&& prepareCredential.includes('setTimeout(() => void cleanup(), DIRECT_SCP_PROBE_CLEANUP_DELAY_MS)')
				&& prepareCredential.includes('setTimeout(() => void cleanup(), DIRECT_SCP_PROBE_BACKGROUND_TIMEOUT_MS + DIRECT_SCP_PROBE_CLEANUP_DELAY_MS)')
				&& !service.includes('scheduleRemoteScpCredentialCleanupRetry'),
			bestEffortCleanupIsBounded: bestEffortUnlink.includes('timeoutMs = 2000')
				&& bestEffortUnlink.includes('withTurboFileTimeout(this.unlinkRemote(sftp, remotePath), timeoutMs')
				&& bestEffortUnlink.includes('return isRemotePathMissingError(error);'),
			credentialHasActivityAwareExpiryFallback: service.includes('const REMOTE_SCP_CREDENTIAL_TTL_SECONDS = 60;')
				&& prepareCredential.includes('command -v nohup')
				&& prepareCredential.includes('const activePath = `${identityPath}.active`;')
				&& (prepareCredential.match(/sleep \$\{REMOTE_SCP_CREDENTIAL_TTL_SECONDS\}/g)?.length ?? 0) === 2
				&& (prepareCredential.match(/kill -0 "\$pid"/g)?.length ?? 0) === 2
				&& (prepareCredential.match(/pid=\$\(cat "\$active"/g)?.length ?? 0) === 2
				&& (prepareCredential.match(/\[ -e "\$key" \] \|\| break/g)?.length ?? 0) === 2
				&& prepareCredential.includes('rm -f "$key" "$active"')
				&& !prepareCredential.includes('sleep ${REMOTE_SCP_CREDENTIAL_TTL_SECONDS}; ${cleanupCommand}'),
			exactCleanup: cleanup.includes('this.unlinkRemoteBestEffort(sourceSession.sftp, sourceProbePath)')
				&& cleanup.includes('this.unlinkRemoteBestEffort(targetSession.sftp, sourcePushTargetPath)')
				&& cleanup.includes('this.unlinkRemoteBestEffort(targetSession.sftp, targetPullTargetPath)')
				&& !cleanup.includes('this.execRemote(')
				&& cleanup.includes('setTimeout(cleanup, DIRECT_SCP_PROBE_CLEANUP_DELAY_MS)')
				&& cleanup.includes('setTimeout(cleanup, DIRECT_SCP_PROBE_BACKGROUND_TIMEOUT_MS + DIRECT_SCP_PROBE_CLEANUP_DELAY_MS)'),
			credentialAwareKey: connectionKey.includes("createHash('sha256')") && connectionKey.includes('connection.password') && connectionKey.includes('connection.privateKey') && connectionKey.includes('connection.passphrase'),
			bidirectionalSingleFlight: pairKey.includes('.sort()') && pairKey.includes('<=>${pair[1]}:${protocol}'),
			protocolSpecificOperationCache: preparedCache.includes('`${this.pairKey(sourceKey, targetKey, protocol)}:${route}`'),
			cachePersistsBeyondProbeSessions: !cachedRoute.includes('entry.sourceSession')
				&& !cachedRoute.includes('entry.targetSession')
				&& !cachedRoute.includes('DIRECT_SCP_PROBE_AVAILABLE_TTL_MS'),
			positiveAndNegativeCache: preparedCache.includes('this.directRoutes.set(')
				&& preparedCache.includes('this.relayPairs.set(')
				&& !service.includes('DIRECT_SCP_PROBE_UNAVAILABLE_TTL_MS')
				&& service.includes('invertDirectSshRoute(route)'),
			lastDecisionSurvivesRefreshAge: preparedCache.includes('needsRefresh(')
				&& preparedCache.includes('return preparedAt === undefined || now - preparedAt')
				&& !preparedCache.includes('this.directRoutes.delete(this.routeKey(sourceKey, targetKey, protocol, route));\n\t\treturn undefined;'),
			reverseDirectionCache: rememberRoute.includes('const reverseRoute = invertDirectSshRoute(route);')
				&& preparedCache.includes('this.routeKey(targetKey, sourceKey, protocol, reverseRoute)')
				&& rememberRoute.includes('this.directSshRouteCache.set(getDirectSshRouteCacheKey(target, source), reverseRoute);'),
			failedPhysicalDirectionClearsMirror: forgetRoute.includes('this.preparedDirectRouteCache.forgetRoute(')
				&& forgetRoute.includes('generation')
				&& preparedCache.includes('?.generation !== generation')
				&& preparedCache.includes('this.routeKey(targetKey, sourceKey, protocol, invertDirectSshRoute(route))'),
			positiveRoutesPersistAcrossRestarts: routePersistence.includes('this.stateService.getItem<readonly IPersistedDirectRoute[]>')
				&& routePersistence.includes('DIRECT_ROUTE_PERSISTENCE_TTL_MS')
				&& routePersistence.includes('this.preparedDirectRouteCache.rememberRoute(')
				&& rememberRoute.includes('this.rememberPersistedDirectRoute('),
			persistedRoutesAreInvalidatedWithTopology: forgetRoute.includes('this.forgetPersistedDirectRoute(sourceKey, targetKey, protocol)')
				&& service.includes('this.forgetPersistedDirectRoute(sourceKey, targetKey, protocol);'),
			backgroundRelayIsPersisted: service.includes('else if (outcome.confirmedUnavailable && outcome.sourceSession && outcome.targetSession)')
				&& service.includes('this.rememberDirectScpProbeUnavailable(source.connection!, target.connection!, protocol);')
		}, {
			cacheMissStaysUnknown: true,
			foregroundSharesSingleFlight: true,
			paneRetriesOnlyIndeterminateProbes: true,
			primaryProtocolFinishesFirst: true,
			secondaryProtocolsRunInBackground: true,
			staleDecisionsRefreshOnlyInBackground: true,
			backgroundHasIndependentLimit: true,
			preservesCoordinatorAvailabilityDistinction: true,
			reusesBothPaneSessions: true,
			restoresLateSessionIdleTimers: true,
			isolatedTemporaryPaths: true,
			latePreparationIsUnlinked: true,
			realScpCommand: true,
			matchedTarCommand: true,
			matchedRsyncAndSftpCommands: true,
			preparesOnlyPlannedDirectProtocols: true,
			windowsPathsSkipEveryPosixProbe: true,
			allPlannedDirectProtocolsAreCollected: true,
			noSerialPingBeforeProtocolProof: true,
			noBusinessPaths: true,
			privateKeyParity: true,
			boundedCredentialSetup: true,
			cancelableExec: true,
			credentialCommandCarriesItsOwnTrap: true,
			credentialCleanupRetriesOnlyAfterFailure: true,
			failedCredentialSetupUsesExistingSftp: true,
			bestEffortCleanupIsBounded: true,
			credentialHasActivityAwareExpiryFallback: true,
			exactCleanup: true,
			credentialAwareKey: true,
			bidirectionalSingleFlight: true,
			protocolSpecificOperationCache: true,
			cachePersistsBeyondProbeSessions: true,
			positiveAndNegativeCache: true,
			lastDecisionSurvivesRefreshAge: true,
			reverseDirectionCache: true,
			failedPhysicalDirectionClearsMirror: true,
			positiveRoutesPersistAcrossRestarts: true,
			persistedRoutesAreInvalidatedWithTopology: true,
			backgroundRelayIsPersisted: true
		});
	});

	test('uses Chinese recycle-bin permanent deletion confirmations', () => {
		const editorPath = path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts');
		const editor = fs.readFileSync(editorPath, 'utf8');
		const permanentDelete = methodBlock(editor, 'private async permanentlyDeleteSelectedTrashItems', 'private async emptyTrash');
		const emptyTrash = methodBlock(editor, 'private async emptyTrash', 'private async compressSelected');

		assert.ok(permanentDelete.includes('永久删除'));
		assert.ok(permanentDelete.includes('永久删除选中的 {0} 个项目吗？此操作无法撤销。'));
		assert.ok(emptyTrash.includes('清空回收站'));
		assert.ok(emptyTrash.includes('永久删除当前设备回收站中的所有项目吗？此操作无法撤销。'));
		assert.ok(!permanentDelete.includes('Permanently Delete'));
		assert.ok(!emptyTrash.includes('Empty Recycle Bin'));
	});
});
