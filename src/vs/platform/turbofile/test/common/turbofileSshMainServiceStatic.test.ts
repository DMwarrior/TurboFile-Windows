/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('TurboFileSshMainServiceStatic', () => {
	const servicePath = () => path.join(process.cwd(), 'src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts');

	test('lists remote directories with a fresh fast SSH command before falling back to shared SFTP', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const listCoreIndex = service.indexOf('private async listRemoteDirectoryCore');
		const fastClientIndex = service.indexOf('this.readRemoteDirectoryWithFreshFastClient', listCoreIndex);
		const sharedSftpIndex = service.indexOf('this.getDirectorySftpSession', fastClientIndex);
		const fastCommandIndex = service.indexOf('private async readRemoteDirectoryFastCommand');

		assert.ok(listCoreIndex >= 0);
		assert.ok(fastClientIndex > listCoreIndex);
		assert.ok(sharedSftpIndex > fastClientIndex);
		assert.ok(fastCommandIndex > listCoreIndex);
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
});
