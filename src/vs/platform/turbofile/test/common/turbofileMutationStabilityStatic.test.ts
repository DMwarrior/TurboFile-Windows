/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

function block(source: string, startName: string, endName: string): string {
	const start = source.indexOf(startName);
	assert.ok(start >= 0, `missing ${startName}`);
	const end = source.indexOf(endName, start);
	assert.ok(end > start, `missing ${endName}`);
	return source.slice(start, end);
}

suite('TurboFileMutationStabilityStatic', () => {
	const servicePath = () => path.join(process.cwd(), 'src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts');

	test('moves POSIX recycle-bin batches with metadata in one remote command', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const move = block(service, 'private async moveRemotePathsToTrash', 'private async listRemoteTrashItems');
		const builder = block(service, 'function buildPosixTrashMoveBatchCommand', 'function buildWindowsTrashMoveBatchCommand');

		assert.ok(!move.includes('writeRemoteTextFile'));
		assert.ok(!move.includes('renameRemotePath'));
		assert.ok(move.includes('prepared.item.id, prepared.source.endpoint.path, prepared.item.payloadPath, prepared.pendingPath, prepared.metadataPath'));
		assert.ok(builder.includes("read -r -d '' metadata"));
		assert.ok(builder.includes('> "$pending"'));
		assert.ok(builder.includes('mv -n -- "$pending" "$final"'));
		assert.ok(move.includes('this.resolveRemoteTrashRoots'));
	});

	test('moves large POSIX recycle-bin batches without spawning external mv processes per item', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const builder = block(service, 'function buildPosixTrashMoveBatchCommand', 'function buildWindowsTrashMoveBatchCommand');

		assert.ok(builder.includes('command -v python3'));
		assert.ok(builder.includes('run_with_heartbeat python3 -c'));
		assert.ok(builder.includes('ctypes.CDLL(None, use_errno=True)'));
		assert.ok(builder.includes('RENAME_NOREPLACE = 1'));
		assert.ok(builder.includes('rename_noreplace(src, dst)'));
		assert.ok(builder.includes('rename_noreplace(pending, final)'));
		assert.ok(!builder.includes('os.rename(src, dst)'));
		assert.ok(builder.includes('mv -n -- "$src" "$dst"'));
		assert.ok(builder.includes('! path_exists "$src"'));
		assert.ok(builder.includes('created_directories'));
		assert.ok(builder.includes('output.flush()'));
	});

	test('lists large POSIX recycle bins in one Python process with a portable fallback', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const builder = block(service, 'function buildPosixTrashListCommand', 'function buildWindowsTrashListCommand');

		assert.ok(builder.includes('command -v python3'));
		assert.ok(builder.includes('os.scandir(info)'));
		assert.ok(builder.includes('with open(entry.path, "rb")'));
		assert.ok(builder.includes('find "$info"'));
	});

	test('keeps a streaming remote recycle-bin listing alive while output continues', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const remoteList = block(service, 'private async listRemoteTrashItems', 'private async recoverRemotePendingTrashItemsNative');

		assert.ok(remoteList.includes('inactivityTimeoutMs: REMOTE_DIRECTORY_READ_INACTIVITY_TIMEOUT_MS'));
		assert.ok(!remoteList.includes('timeoutMs: REMOTE_DIRECTORY_READ_MAX_TIMEOUT_MS'));
	});

	test('never removes pre-existing pending recycle-bin metadata on a move conflict', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const builder = block(service, 'function buildPosixTrashMoveBatchCommand', 'function buildWindowsTrashMoveBatchCommand');
		const windowsBuilder = block(service, 'function buildWindowsTrashMoveBatchCommand', 'function parseRemoteTrashMoveResults');

		assert.ok(builder.includes('pending_created = False'));
		assert.ok(builder.includes('pending_created = True'));
		assert.ok(builder.includes('if pending_created and os.path.lexists(src)'));
		assert.ok(builder.includes('pending_created=0'));
		assert.ok(builder.includes('pending_created=1'));
		assert.ok(builder.includes('[ "$pending_created" -eq 1 ]'));
		assert.ok(windowsBuilder.includes('$pendingCreated=$false'));
		assert.ok(windowsBuilder.includes('$pendingCreated=$true'));
		assert.ok(windowsBuilder.includes('if ($pendingCreated -and'));
		assert.ok(windowsBuilder.includes('$pathExists={'));
		assert.ok(windowsBuilder.includes('[System.IO.File]::GetAttributes($path)'));
		const finalConflictCheck = windowsBuilder.indexOf('if (& $pathExists ([string]$item.metadataPath))');
		const pendingCreate = windowsBuilder.indexOf('[System.IO.FileMode]::CreateNew');
		assert.ok(finalConflictCheck >= 0 && finalConflictCheck < pendingCreate);
		assert.ok(windowsBuilder.includes('if ($pendingCreated -and -not $sourceExists -and $payloadExists)'));
		assert.ok(windowsBuilder.includes('[System.IO.Directory]::Move($payloadPath, $sourcePath)'));
		assert.ok(windowsBuilder.includes('[System.IO.File]::Move($payloadPath, $sourcePath)'));
		assert.ok(windowsBuilder.includes('$sourceExists=$true; $payloadExists=$false'));
	});

	test('uses bounded workers for local recycle-bin and delete mutations', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const moveToTrash = block(service, 'async movePathsToTrash', 'async listTrashItems');
		const deleteTrash = block(service, 'private async deleteTrashItemsNative', 'private async emptyTrashNative');
		const deletePaths = block(service, 'async deletePaths', 'private async deleteRemotePathNative');
		const movePaths = block(service, 'async movePathsIntoDirectory', 'async calculatePathSize');

		for (const mutation of [moveToTrash, deleteTrash, deletePaths, movePaths]) {
			assert.ok(mutation.includes('mapLimit('));
		}
		assert.ok(!deleteTrash.includes('return Promise.all(items.map'));
		assert.ok(!deletePaths.includes('Promise.all(targets.map'));
		assert.ok(!movePaths.includes('Promise.all(targets.map'));
	});

	test('falls back failed recycle-bin items to bounded permanent deletion', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const moveToTrash = block(service, 'private async movePathsToTrashCore', 'async listTrashItems');
		const moveRemoteToTrash = block(service, 'private async moveRemotePathsToTrash', 'private async listRemoteTrashItems');

		assert.ok(moveToTrash.includes('const validationResults'));
		assert.ok(moveToTrash.includes('let trashResults'));
		assert.ok(moveToTrash.includes('runTurboFileTrashFallback('));
		assert.ok(moveToTrash.includes('mapLimit('));
		assert.ok(moveToTrash.includes('this.deletePathCore(endpoint, true)'));
		assert.ok(moveToTrash.includes("localize('turbofileTrashFallbackOperationSucceeded'"));
		assert.ok(!moveToTrash.includes('results.find('));
		assert.ok(!moveToTrash.includes('results.findIndex('));
		assert.ok(!moveToTrash.includes('this.deletePath(source.endpoint, true)'));
		assert.ok(moveRemoteToTrash.includes('for (const [sourceIndex, source] of sources.entries())'));
		assert.ok(moveRemoteToTrash.includes('results[sourceIndex] ='));
	});

	test('streams large Windows SSH deletion lists through stdin', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const deletePaths = block(service, 'async deletePaths', 'private async deleteRemotePathNative');

		assert.ok(deletePaths.includes('buildWindowsDeleteManyFromInputCommand(recursive)'));
		assert.ok(deletePaths.includes('execRemoteWithInput'));
		assert.ok(deletePaths.includes('JSON.stringify(targets.map(endpoint => endpoint.path))'));
	});

	test('streams large Windows local and same-device move lists through stdin', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const localBatch = block(service, 'private async runLocalNativeBatchTransfer', 'private async runSameRemoteNativeBatchTransfer');
		const remoteBatch = block(service, 'private async runSameRemoteNativeBatchTransfer', 'private async tryLocalBatchRsyncTransfer');
		const cleanup = block(service, 'private async deleteBatchSources', 'private joinBatchTargetPath');
		const builder = block(service, 'function buildWindowsMappedBatchFromInputScript', 'function buildWindowsCopyCommand');

		assert.ok(localBatch.includes('buildWindowsMappedBatchFromInputScript'));
		assert.ok(localBatch.includes('targetPath: this.joinBatchTargetPath'));
		assert.ok(localBatch.includes('input: Buffer.from(JSON.stringify(mappings)'));
		assert.ok(remoteBatch.includes('buildWindowsMappedBatchFromInputCommand'));
		assert.ok(remoteBatch.includes('targetPath: this.joinBatchTargetPath'));
		assert.ok(remoteBatch.includes('execRemoteWithInput'));
		assert.ok(builder.includes('$item.sourcePath'));
		assert.ok(builder.includes('$item.targetPath'));
		assert.ok(!builder.includes('-Force'));
		assert.ok(cleanup.includes('buildWindowsDeleteManyFromInputCommand(true)'));
		assert.ok(cleanup.includes('execRemoteWithInput'));
		assert.ok(!service.includes('function buildWindowsBatchDeleteCommand'));
	});

	test('uses activity-based timeouts for long stdin batch commands', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const execWithInput = block(service, 'private execRemoteWithInput', 'private parseRsyncProgressSnapshot');

		assert.ok(execWithInput.includes('armInactivityTimeout'));
		assert.ok(execWithInput.includes('options.inactivityTimeoutMs'));
		assert.ok(execWithInput.includes('options.inactivityMessage'));
	});

	test('keeps long mutation batches alive and handles stdin failures', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const cleanup = block(service, 'private async deleteBatchSources', 'private joinBatchTargetPath');
		const deletePaths = block(service, 'async deletePaths', 'private async deleteRemotePathNative');
		const trashMove = block(service, 'private async moveRemotePathsToTrash', 'private async listRemoteTrashItems');
		const trashDelete = block(service, 'private async deleteTrashItemsNative', 'private async emptyTrashNative');
		const localCommand = block(service, 'private runCancelableLocalCommand', 'private fireTransferProgress');
		const deleteBuilder = block(service, 'function buildWindowsDeleteManyFromInputCommand', 'function buildWindowsSizeCommand');
		const trashMoveBuilder = block(service, 'function buildWindowsTrashMoveBatchCommand', 'function parseRemoteTrashMoveResults');
		const trashDeleteBuilder = block(service, 'function buildWindowsTrashDeleteBatchCommand', 'function buildPosixTrashHasItemsCommand');

		assert.ok(cleanup.includes('progressId'));
		assert.ok(deletePaths.includes('inactivityTimeoutMs: REMOTE_DIRECTORY_READ_MAX_TIMEOUT_MS'));
		assert.ok(trashMove.includes("? {}\n\t\t\t\t: { inactivityTimeoutMs: REMOTE_DIRECTORY_READ_MAX_TIMEOUT_MS"));
		assert.ok(trashDelete.includes("? {}\n\t\t\t\t: { inactivityTimeoutMs: REMOTE_DIRECTORY_READ_MAX_TIMEOUT_MS"));
		assert.ok(deleteBuilder.includes('[Console]::Out.WriteLine'));
		assert.ok(trashMoveBuilder.includes('[Console]::Error.WriteLine'));
		assert.ok(trashDeleteBuilder.includes('[Console]::Error.WriteLine'));
		assert.ok(localCommand.includes("child.stdin?.on('error'"));
		assert.ok(!trashMoveBuilder.includes('$results +='));
		assert.ok(!trashDeleteBuilder.includes('$results +='));
		assert.ok(trashMoveBuilder.includes('[System.Collections.Generic.List[object]]::new()'));
		assert.ok(trashDeleteBuilder.includes('[System.Collections.Generic.List[object]]::new()'));
	});

	test('bounds remote exec channel acquisition and consumes stream input errors', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const exec = block(service, 'private execRemote(client', 'private execRemoteBytes');
		const execBytes = block(service, 'private execRemoteBytes', 'private execRemoteWithInput');
		const execWithInput = block(service, 'private execRemoteWithInput', 'private parseRsyncProgressSnapshot');
		const nativeInput = block(service, 'private async runNativeSshCommandWithInput', 'private async prepareRemoteBatchTarTarget');
		const inputHelper = block(service, 'function writeInputToWritableStream', 'function waitForLocalProcessClose');

		for (const implementation of [exec, execBytes, execWithInput]) {
			assert.ok(implementation.includes('REMOTE_EXEC_CHANNEL_OPEN_TIMEOUT_MS'));
			assert.ok(implementation.includes("stream.on('error'"));
			assert.ok(implementation.includes('if (settled)'));
		}
		assert.ok(execWithInput.includes('options.progressId'));
		assert.ok(nativeInput.includes('writeInputToWritableStream'));
		assert.ok(inputHelper.includes("stream.on('error'"));
	});

	test('does not impose a fixed total timeout while emptying a remote recycle bin', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const emptyTrash = block(service, 'private async emptyTrashNative', 'private async hasTrashItemsNative');
		const posixBuilder = block(service, 'function buildPosixTrashEmptyCommand', 'function buildWindowsTrashEmptyCommand');

		assert.ok(!emptyTrash.includes('timeoutMs: REMOTE_DIRECTORY_READ_MAX_TIMEOUT_MS'));
		assert.ok(emptyTrash.includes('inactivityTimeoutMs: REMOTE_DIRECTORY_READ_MAX_TIMEOUT_MS'));
		assert.ok(posixBuilder.includes('run_with_heartbeat'));
	});

	test('propagates POSIX recycle-bin empty failures without command-substitution masking', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const posixBuilder = block(service, 'function buildPosixTrashEmptyCommand', 'function buildWindowsTrashEmptyCommand');

		assert.ok(posixBuilder.includes('set -e'));
		assert.ok(posixBuilder.includes('pipefail'));
		assert.ok(posixBuilder.includes('total=0'));
		assert.ok(posixBuilder.includes('total=$((total + count))'));
		assert.ok(posixBuilder.includes('run_with_heartbeat rm -rf'));
		assert.ok(!posixBuilder.includes('counts='));
		assert.ok(!posixBuilder.includes('$({ ${invocations}; })'));
		assert.ok(!posixBuilder.includes("awk '{ total += $1 }"));
	});

	test('uses nul-safe heartbeat commands for long POSIX mutations', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const cleanup = block(service, 'private async deleteBatchSources', 'private joinBatchTargetPath');
		const deletePaths = block(service, 'private async deletePathsCore', 'private async deleteRemotePathNative');
		const movePaths = block(service, 'private async movePathsIntoDirectoryCore', 'async calculatePathSize');

		for (const mutation of [cleanup, deletePaths, movePaths]) {
			assert.ok(mutation.includes('execRemoteWithInput'));
			assert.ok(mutation.includes('inactivityTimeoutMs:'));
			assert.ok(!mutation.includes('timeoutMs: REMOTE_DIRECTORY_READ_MAX_TIMEOUT_MS'));
		}
		assert.ok(service.includes('function buildPosixDeleteManyFromInputCommand'));
		assert.ok(service.includes('function buildPosixMoveManyIntoDirectoryFromInputCommand'));
	});

	test('stops POSIX heartbeat timers immediately when a mutation finishes', () => {
		const heartbeat = fs.readFileSync(path.join(process.cwd(), 'src/vs/platform/turbofile/common/turbofilePosixHeartbeat.ts'), 'utf8');

		assert.ok(heartbeat.includes('coproc TURBOFILE_HEARTBEAT_COMMAND'));
		assert.ok(heartbeat.includes('read -r -t 30 command_status'));
		assert.ok(heartbeat.includes('return "$command_status"'));
		assert.ok(!heartbeat.includes('sleep 30'));
		assert.ok(!heartbeat.includes('wait -n'));
	});

	test('deletes large POSIX recycle-bin selections in chunks under one heartbeat', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const builder = block(service, 'function buildPosixTrashDeleteBatchCommand', 'function buildWindowsTrashDeleteBatchCommand');

		assert.ok(builder.includes('start+=64'));
		assert.ok(builder.includes('args+=("${payloads[index]}" "${metadatas[index]}")'));
		assert.strictEqual(builder.match(/run_with_heartbeat/g)?.length, 1);
		assert.ok(!builder.includes('run_with_heartbeat rm -rf'));
	});

	test('keeps POSIX heartbeat compatible with Bash 4.0 without polling process storms', () => {
		const heartbeat = fs.readFileSync(path.join(process.cwd(), 'src/vs/platform/turbofile/common/turbofilePosixHeartbeat.ts'), 'utf8');

		assert.ok(heartbeat.includes('coproc TURBOFILE_HEARTBEAT_COMMAND'));
		assert.ok(heartbeat.includes('jobs -pr'));
		assert.ok(heartbeat.includes('wait "$command_pid"'));
		assert.ok(!heartbeat.includes('help wait'));
		assert.ok(!heartbeat.includes('BASH_VERSINFO'));
		assert.ok(!heartbeat.includes('sleep 30'));
	});

	test('bounds local recycle-bin metadata reads', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const listLocalTrash = block(service, 'private async listLocalTrashItems', 'private async recoverLocalPendingTrashItem');

		assert.ok(listLocalTrash.includes('mapLimit('));
		assert.ok(!listLocalTrash.includes('Promise.all(entries.map'));
	});

	test('queues every file-system mutation on its device key', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const createDirectory = block(service, 'async createDirectory', 'private async createDirectoryCore');
		const writeFile = block(service, 'async writeFile', 'private async writeFileCore');
		const rename = block(service, 'async renamePath', 'private async renamePathCore');
		const compress = block(service, 'async compressPath', 'private async compressPathCore');
		const extract = block(service, 'async extractPath', 'private async extractPathCore');

		for (const mutation of [createDirectory, writeFile, rename, compress, extract]) {
			assert.ok(mutation.includes('this.fileOperationQueue.run'));
			assert.ok(mutation.includes('getFileOperationDeviceKeys(endpoint)'));
		}
	});

	test('deletes permanently without sudo on restricted POSIX devices', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const contract = fs.readFileSync(path.join(process.cwd(), 'src/vs/platform/turbofile/common/turbofile.ts'), 'utf8');
		const deletePath = block(service, 'private async deletePathCore', 'async deletePaths');
		const deletePaths = block(service, 'async deletePaths', 'resolveRemoteAgent');
		const deleteManyBuilder = block(service, 'function buildPosixDeleteManyFromInputCommand', 'function buildPosixMoveManyIntoDirectoryFromInputCommand');
		const deleteOneBuilder = block(service, 'function buildPosixDeleteCommand', 'function getMimeType');

		assert.ok(contract.includes('deletePaths(endpoints: readonly ITurboFileTransferEndpoint[], recursive?: boolean)'));
		assert.ok(!contract.includes('deletePaths(endpoints: readonly ITurboFileTransferEndpoint[], recursive?: boolean, useSudo?: boolean)'));
		assert.ok(!deletePaths.includes('useSudo'));
		assert.ok(!deletePath.includes('useSudo'));
		assert.ok(!deleteManyBuilder.includes('useSudo'));
		assert.ok(!deleteManyBuilder.includes('sudo -n'));
		assert.ok(!deleteOneBuilder.includes('useSudo'));
		assert.ok(!deleteOneBuilder.includes('sudo -n'));
		assert.ok(deletePath.includes('await this.deleteRemotePathNative(endpoint, recursive)'));
		assert.ok(deletePath.includes('await this.withSftp(endpoint'));
	});

	test('falls back failed POSIX batch deletion to per-path deletion', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const deletePathsCore = block(service, 'private async deletePathsCore', 'private async deleteRemotePathNative');

		assert.ok(deletePathsCore.includes('buildPosixDeleteManyFromInputCommand(recursive)'));
		assert.ok(deletePathsCore.includes('await mapLimit(targets, workerLimit, endpoint => this.deletePathCore(endpoint, recursive))'));
		assert.ok(deletePathsCore.includes('filter(({ result }) => !result.ok)'));
	});
});
