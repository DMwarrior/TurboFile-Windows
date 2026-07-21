/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

function methodBlock(source: string, name: string, nextName: string): string {
	const start = source.indexOf(name);
	return source.slice(start, source.indexOf(nextName, start));
}

function functionBlock(source: string, name: string): string {
	const start = source.indexOf(`function ${name}`);
	assert.ok(start >= 0, `missing function ${name}`);
	const end = source.indexOf('\nfunction ', start + 1);
	return source.slice(start, end === -1 ? source.length : end);
}

function numericProductConstant(source: string, name: string): number {
	const match = new RegExp(`const ${name} = ([0-9 *]+);`).exec(source);
	assert.ok(match, `missing numeric constant ${name}`);
	return match[1].split('*').reduce((product, factor) => product * Number(factor.trim()), 1);
}

suite('TurboFileSshMainServiceStatic', () => {
	const servicePath = () => path.join(process.cwd(), 'src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts');

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

	test('shares source reads while serializing target writes without nesting the operation queue', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const transferFile = methodBlock(service, 'async transferFile', 'private async transferFileCore');
		const transferBatch = methodBlock(service, 'async transferBatch', 'private async transferBatchCore');
		const concurrentBatch = methodBlock(service, 'private async runConcurrentBatchTransfer', 'private fireBatchAggregateProgress');
		const uploadVerification = methodBlock(service, 'private async verifySshUploadSize', 'private async tryLocalToSshTarTransfer');
		const deletePathsCore = methodBlock(service, 'private async deletePathsCore', 'private async deleteRemotePathNative');

		assert.ok(service.includes("import { TurboFileOperationCanceledError, TurboFileOperationQueue } from '../common/turbofileOperationQueue.js';"));
		assert.ok(service.includes('private readonly fileOperationQueue = new TurboFileOperationQueue();'));
		assert.ok(service.includes('function getFileOperationDeviceKey('));
		assert.ok(service.includes("return 'local';"));
		assert.ok(service.includes('connection.username'));
		assert.ok(service.includes('connection.host'));
		assert.ok(service.includes('connection.port'));
		assert.ok(service.includes("operation === 'move'"));
		assert.ok(service.includes('{ read: [sourceKey], write: [targetKey] }'));
		assert.ok(service.includes('this.fileOperationQueue.cancel(progressId)'));

		assert.ok(transferFile.includes('this.fileOperationQueue.runWithAccess'));
		assert.ok(transferFile.includes("getTransferOperationAccess(request.source, request.target, 'copy')"));
		assert.ok(transferFile.includes('id: request.progressId'));
		assert.ok(transferBatch.includes('this.fileOperationQueue.runWithAccess'));
		assert.ok(transferBatch.includes('getTransferOperationAccess(request.source, request.targetDirectory, operation)'));
		assert.ok(transferBatch.includes('id: request.progressId'));

		assert.ok(concurrentBatch.includes('this.transferFileCore({'));
		assert.ok(!concurrentBatch.includes('this.transferFile({'));
		assert.ok(uploadVerification.includes('this.deletePathCore(target, true)'));
		assert.ok(deletePathsCore.includes('this.deletePathCore(targets[0], recursive)'));
	});

	test('queues recycle-bin, delete, and same-device move writes on their device keys', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const moveToTrash = methodBlock(service, 'async movePathsToTrash', 'private async movePathsToTrashCore');
		const restoreTrash = methodBlock(service, 'async restoreTrashItems', 'private async restoreTrashItemsCore');
		const permanentDelete = methodBlock(service, 'async permanentlyDeleteTrashItems', 'private async permanentlyDeleteTrashItemsCore');
		const emptyTrash = methodBlock(service, 'async emptyTrash', 'private async emptyTrashCore');
		const deletePaths = methodBlock(service, 'async deletePaths', 'private async deletePathsCore');
		const movePaths = methodBlock(service, 'async movePathsIntoDirectory', 'private async movePathsIntoDirectoryCore');

		for (const block of [moveToTrash, restoreTrash, permanentDelete, emptyTrash, deletePaths, movePaths]) {
			assert.ok(block.includes('this.fileOperationQueue.run'));
		}
		assert.ok(moveToTrash.includes('getFileOperationDeviceKey(request.device)'));
		assert.ok(restoreTrash.includes('getFileOperationDeviceKey(request.device)'));
		assert.ok(permanentDelete.includes('getFileOperationDeviceKey(request.device)'));
		assert.ok(emptyTrash.includes('getFileOperationDeviceKey(device)'));
		assert.ok(deletePaths.includes('getFileOperationDeviceKeys(...endpoints)'));
		assert.ok(movePaths.includes('getFileOperationDeviceKeys(...sources)'));
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
		for (const builder of builders) {
			assert.ok(builder.includes('buildPipefailBashCommand('));
			assert.ok(builder.includes('|'));
		}
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

		assert.ok(nativeDownload.includes('remoteInput?: Uint8Array'));
		assert.ok(nativeDownload.includes("writeInputToWritableStream(sshProcess.stdin, remoteInput, 'native tar download path list')"));
		assert.ok(batchDownload.includes('createRemoteBatchTarSourcePlan'));
		assert.ok(batchDownload.includes('sourcePlan.input'));
		assert.ok(batchDownload.includes("writeInputToWritableStream(sourceStream.stream, sourcePlan.input, 'batch tar download path list')"));
	});

	test('keeps large direct and relay tar commands compact while preserving streaming progress', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const direct = methodBlock(service, 'private async tryDirectBatchTarTransferRoute', 'private async tryRelayBatchTarTransfer');
		const relay = methodBlock(service, 'private async tryRelayBatchTarTransfer', 'private async runConcurrentBatchTransfer');

		assert.ok(direct.includes('isTurboFileBatchCommandSafe'));
		assert.ok(direct.includes('prepareRemoteBatchTarTarget'));
		assert.ok(direct.includes('input: sourcePlan.input'));
		assert.ok(relay.includes('createRemoteBatchTarSourcePlan'));
		assert.ok(relay.includes('execRemoteWithInput'));
		assert.ok(relay.includes("writeInputToWritableStream(sourceStream.stream, sourcePlan.input, 'batch tar relay path list')"));
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
		assert.ok(!remoteList.includes('withDirectorySftp'));
		assert.ok(!remoteList.includes('readRemoteDirectory'));
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

	test('uses verified direct routes without negative cooldown state', () => {
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
			importsRouteCoordinator: service.includes("import { classifyTurboFileDirectSshVerification, orderTurboFileDirectSshRoutes, runTurboFileDirectRouteFlow, TurboFileDirectSshRoute, TurboFileDirectVerification } from '../common/turbofileDirectRoute.js';"),
			noDuplicateRouteType: !service.includes("type TurboFileDirectSshRoute = 'source-push' | 'target-pull';"),
			verificationMethod: service.includes('private async verifyDirectSshRoute('),
			attemptWrapper: service.includes('private async runVerifiedDirectRouteAttempt<T>('),
			verificationMarker: service.includes('__TURBOFILE_DIRECT_READY__'),
			typedRemoteCommandExit: service.includes('class TurboFileRemoteCommandExitError extends Error') && service.includes('new TurboFileRemoteCommandExitError('),
			preciseVerificationFailure: service.includes('classifyTurboFileDirectSshVerification(output.toString(\'utf8\') === DIRECT_SSH_READY_MARKER, false)') && service.includes('classifyTurboFileDirectSshVerification(false, error instanceof TurboFileRemoteCommandExitError)'),
			quotedMarkerPrintf: service.includes('`printf %s ${quotePosixShellArg(DIRECT_SSH_READY_MARKER)}`'),
			boundedMarkerExec: service.includes('execRemoteBytes(client, command, { timeoutMs: DIRECT_TRANSFER_STALL_TIMEOUT_MS, progressId })')
		}, {
			removedNegativeState: true,
			importsRouteCoordinator: true,
			noDuplicateRouteType: true,
			verificationMethod: true,
			attemptWrapper: true,
			verificationMarker: true,
			typedRemoteCommandExit: true,
			preciseVerificationFailure: true,
			quotedMarkerPrintf: true,
			boundedMarkerExec: true
		});
	});

	test('cancels verification connection setup and cleans credentials in order', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const connect = methodBlock(service, 'private async connect(config: ConnectConfig', 'private connectDirectSsh');
		const verification = methodBlock(service, 'private async verifyDirectSshRoute', 'private async resolveRemoteRsyncSshBinary');

		assert.deepStrictEqual({
			usesCancelableConnect: verification.includes('this.connectDirectSsh(executorConfig, progressId)'),
			registersBeforeConnect: connect.indexOf('this.registerTransferCancelHandler(progressId') >= 0 && connect.indexOf('this.registerTransferCancelHandler(progressId') < connect.indexOf('client.connect('),
			cancelEndsClient: connect.includes('client.end();'),
			cancelRejectsTyped: connect.includes('reject(new TurboFileTransferCanceledError())'),
			keepsConnectedClientAlive: !verification.includes('this.registerTransferCancelHandler(progressId, () => client.end())'),
			cleanupBeforeEnd: verification.indexOf('credential?.cleanupCommand') < verification.lastIndexOf('client.end();')
		}, {
			usesCancelableConnect: true,
			registersBeforeConnect: true,
			cancelEndsClient: true,
			cancelRejectsTyped: true,
			keepsConnectedClientAlive: true,
			cleanupBeforeEnd: true
		});
	});

	test('keeps temporary direct credentials cancelable and cleanup-safe', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const wrapper = methodBlock(service, 'private async runVerifiedDirectRouteAttempt<T>', 'private async verifyDirectSshRoute');
		const verification = methodBlock(service, 'private async verifyDirectSshRoute', 'private async resolveRemoteRsyncSshBinary');
		const batchTar = methodBlock(service, 'private async tryDirectBatchTarTransferRoute', 'private async tryRelayBatchTarTransfer');
		const directTar = methodBlock(service, 'private async tryDirectTarTransferRoute', 'private async tryDirectRsyncTransfer');
		const directScp = methodBlock(service, 'private async tryDirectScpTransferRoute', 'private async prepareRemoteScpCredential');
		const credential = methodBlock(service, 'private async prepareRemoteScpCredential', 'private async tryDirectSftpTransfer');
		const exec = methodBlock(service, 'private execRemote(client: ISSHClient', 'private execRemoteBytes');
		const execBytes = methodBlock(service, 'private execRemoteBytes', 'private execRemoteWithInput');

		assert.deepStrictEqual({
			prechecksRun: wrapper.includes('run: async (route, retry) => {\n\t\t\t\tthis.throwIfTransferCanceled(progressId);') && wrapper.indexOf('this.throwIfTransferCanceled(progressId);') < wrapper.indexOf("if (retry) {") && wrapper.indexOf("if (retry) {") < wrapper.indexOf('return await run(route, retry);'),
			prechecksVerify: wrapper.includes('verify: async route => {\n\t\t\t\tthis.throwIfTransferCanceled(progressId);'),
			strictVerifierRead: verification.includes('this.prepareRemoteScpCredential(client, remoteEndpoint.connection, progressId, true)'),
			legacyFallback: credential.includes('strictPrivateKeyRead = false') && credential.includes('this.readPrivateKey(remoteConnection.privateKeyPath).catch(() => undefined)'),
			legacyCallersNonStrict: [batchTar, directTar, directScp].every(block => block.includes('this.prepareRemoteScpCredential(client, remoteEndpoint.connection, request.progressId)')),
			checksCancelBeforeSetup: credential.indexOf('this.throwIfTransferCanceled(progressId);') > credential.indexOf('const privateKey =') && credential.indexOf('this.throwIfTransferCanceled(progressId);') < credential.indexOf('const identityPath ='),
			keepsClientsAliveForCleanup: [batchTar, directTar, directScp].every(block => !block.includes('registerTransferCancelHandler(request.progressId, () => client.end())') && block.indexOf('credential?.cleanupCommand') < block.lastIndexOf('client.end();')),
			cancelableDataExec: batchTar.includes('progressId: request.progressId') && directTar.includes('progressId: request.progressId') && (directScp.match(/progressId: request\.progressId/g)?.length ?? 0) >= 2,
			execPrechecksCancellation: [exec, execBytes].every(block => {
				const precheck = block.indexOf('this.throwIfTransferCanceled(options.progressId);');
				return precheck >= 0
					&& precheck < block.indexOf('this.registerTransferCancelHandler(options.progressId')
					&& precheck < block.indexOf('client.exec(');
			})
		}, {
			prechecksRun: true,
			prechecksVerify: true,
			strictVerifierRead: true,
			legacyFallback: true,
			legacyCallersNonStrict: true,
			checksCancelBeforeSetup: true,
			keepsClientsAliveForCleanup: true,
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
		const tarValidation = directTar.indexOf('const targetSize = await this.getRemotePathContentSizeByCommand(request.target, request.progressId)');
		const tarPostcheck = directTar.indexOf('this.throwIfTransferCanceled(request.progressId);', tarValidation);
		const scpValidation = directScp.indexOf('const targetSize = await this.withDirectorySftp(request.target');
		const scpPostcheck = directScp.indexOf('this.throwIfTransferCanceled(request.progressId);', scpValidation);
		const cleanup = 'await this.execRemote(client, credential.cleanupCommand, { timeoutMs: 2000 }).catch(() => undefined);';

		assert.deepStrictEqual({
			batchTarPostchecksDataCommand: batchTar.indexOf('this.throwIfTransferCanceled(request.progressId);') > batchTar.indexOf('await this.execRemote(client, command'),
			directTarPostchecksValidation: tarValidation >= 0 && tarPostcheck > tarValidation && tarPostcheck < directTar.indexOf('if (targetSize !== expectedBytes)'),
			directScpPostchecksValidation: scpValidation >= 0 && scpPostcheck > scpValidation && scpPostcheck < directScp.indexOf('if (targetSize !== bytes)'),
			sizeHelpersPropagateCancellation: remoteSize.includes('progressId?: string')
				&& (remoteSize.match(/this\.throwIfTransferCanceled\(progressId\);/g)?.length ?? 0) >= 4
				&& remoteSize.includes('this.getRemotePathSize(sftp, joinRemotePath(remotePath, entry.filename), progressId)')
				&& remoteSizeByCommand.includes('progressId?: string')
				&& remoteSizeByCommand.includes('this.execRemoteBytes(client, buildWindowsSizeCommand(endpoint.path), { progressId })')
				&& remoteSizeByCommand.includes('this.execRemoteBytes(client, buildPosixSizeCommand(endpoint.path), { progressId })')
				&& remoteSizeByCommand.includes('this.getRemotePathSize(sftp, endpoint.path, progressId)')
				&& remoteContentSizeByCommand.includes('progressId?: string')
				&& remoteContentSizeByCommand.includes('this.getRemotePathSizeByCommand(endpoint, progressId)')
				&& remoteContentSizeByCommand.includes('this.execRemoteBytes(client, buildPosixContentSizeCommand(endpoint.path), { progressId })')
				&& remoteContentSizeByCommand.includes('this.getRemotePathSize(sftp, endpoint.path, progressId)'),
			cleanupIsShortAndUncancelable: [batchTar, directTar, directScp].every(block => block.includes(cleanup))
		}, {
			batchTarPostchecksDataCommand: true,
			directTarPostchecksValidation: true,
			directScpPostchecksValidation: true,
			sizeHelpersPropagateCancellation: true,
			cleanupIsShortAndUncancelable: true
		});
	});

	test('uses Chinese recycle-bin permanent deletion confirmations', () => {
		const editorPath = path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts');
		const editor = fs.readFileSync(editorPath, 'utf8');
		const permanentDelete = methodBlock(editor, 'private async permanentlyDeleteSelectedTrashItems', 'private async emptyTrash');
		const emptyTrash = methodBlock(editor, 'private async emptyTrash', 'private async copySelectedTrashOriginalPath');

		assert.ok(permanentDelete.includes('永久删除'));
		assert.ok(permanentDelete.includes('永久删除选中的 {0} 个项目吗？此操作无法撤销。'));
		assert.ok(emptyTrash.includes('清空回收站'));
		assert.ok(emptyTrash.includes('永久删除当前设备回收站中的所有项目吗？此操作无法撤销。'));
		assert.ok(!permanentDelete.includes('Permanently Delete'));
		assert.ok(!emptyTrash.includes('Empty Recycle Bin'));
	});
});
