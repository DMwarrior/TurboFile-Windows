/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('TurboFileSshMainServiceStatic', () => {
	const servicePath = () => path.join(process.cwd(), 'src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts');

	test('shared directory SFTP sessions are disposed only by their own generation', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');

		assert.ok(service.includes('generation: number;'));
		assert.ok(service.includes('this.touchDirectorySftpSession(session.key, session.generation)'));
		assert.ok(service.includes('this.disposeDirectorySftpSession(session.key, session.generation)'));
		assert.ok(service.includes('private disposeDirectorySftpSession(key: string, generation: number)'));
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

	test('does not delete existing target directories before tar or scp directory transfers', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const dangerousDirectoryDeletion = /rm -rf -- [^;\n]*(?:targetPath|request\.target\.path|target|\$target\/\$name|cleanupTargets|cleanupTargetArgs)/;
		const methodBlock = (methodName: string) => {
			const start = service.indexOf(`private async ${methodName}`);
			assert.ok(start >= 0, `${methodName} should exist`);
			const next = service.indexOf('\n\tprivate async ', start + 1);
			return service.slice(start, next === -1 ? service.length : next);
		};

		for (const functionName of [
			'buildTarExtractToExactDirectoryCommand',
			'buildPrepareTarExtractToExactDirectoryCommand',
			'buildPrepareTarZstdExtractToExactDirectoryCommand',
			'buildTarExtractToDirectoryCommand',
			'buildPrepareTarExtractToDirectoryFromListCommand',
			'buildTarSourcePushCommand',
			'buildTarItemsSourcePushCommand',
			'buildTarTargetPullCommand',
			'buildTarItemsTargetPullCommand'
		]) {
			const start = service.indexOf(`function ${functionName}`);
			assert.ok(start >= 0, `${functionName} should exist`);
			const next = service.indexOf('\nfunction ', start + 1);
			const block = service.slice(start, next === -1 ? service.length : next);
			assert.ok(!dangerousDirectoryDeletion.test(block), `${functionName} should not delete target directories`);
		}

		const directScpStart = service.indexOf('private async tryDirectScpTransferRoute');
		const directScpEnd = service.indexOf('private async prepareRemoteScpCredential', directScpStart);
		const directScpBlock = service.slice(directScpStart, directScpEnd);
		assert.ok(!dangerousDirectoryDeletion.test(directScpBlock), 'direct scp directory preparation should not delete target directories');

		const localScpUploadBlock = methodBlock('runLocalScpUpload');
		assert.ok(!dangerousDirectoryDeletion.test(localScpUploadBlock), 'local scp upload directory preparation should not delete target directories');

		const localScpDownloadBlock = methodBlock('runLocalScpDownload');
		assert.ok(!localScpDownloadBlock.includes('fsp.rm(request.target.path, { recursive, force: true })'), 'local scp download should not delete existing target directories');
		assert.ok(service.includes('Target directory already exists'), 'directory transfer should report existing target directory conflicts');
	});

	test('preflights non-rsync directory target conflicts before transfer fallbacks', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');

		const singleStart = service.indexOf('private async transferBetweenSshDevices');
		const singleEnd = service.indexOf('\n\tprivate async trySameRemoteCopy', singleStart);
		const singleBlock = service.slice(singleStart, singleEnd);
		assert.ok(singleBlock.includes('rejectNonRsyncDirectoryTransferTargetConflict'), 'single SSH-to-SSH transfers should preflight directory target conflicts');
		assert.ok(singleBlock.indexOf('rejectNonRsyncDirectoryTransferTargetConflict') < singleBlock.indexOf('for (const [index, attempt]'), 'single transfer conflict preflight should run before protocol attempts can fall back');

		const batchStart = service.indexOf('async transferBatch');
		const batchEnd = service.indexOf('\n\tprivate getBatchExpectedBytes', batchStart);
		const batchBlock = service.slice(batchStart, batchEnd);
		assert.ok(batchBlock.includes('rejectNonRsyncBatchDirectoryTargetConflicts'), 'batch transfers should preflight directory target conflicts');
		assert.ok(batchBlock.indexOf('rejectNonRsyncBatchDirectoryTargetConflicts') < batchBlock.indexOf('const sameLocal'), 'batch conflict preflight should run before any transfer branch');

		const directSftpStart = service.indexOf('private async tryDirectSftpTransferRoute');
		const directSftpEnd = service.indexOf('private async tryTunneledRsyncRelayTransfer', directSftpStart);
		const directSftpBlock = service.slice(directSftpStart, directSftpEnd);
		assert.ok(!directSftpBlock.includes('rm -rf -- ${quotePosixShellArg(request.target.path)}'), 'direct SFTP fallback should not delete target directories');
	});
});
