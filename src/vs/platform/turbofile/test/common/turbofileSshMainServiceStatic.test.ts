/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('TurboFileSshMainServiceStatic', () => {
	const servicePath = () => path.join(process.cwd(), 'src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts');

	test('lists remote directories through a fresh fast SSH command before using the shared SFTP session', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const listCoreIndex = service.indexOf('private async listRemoteDirectoryCore');
		const freshFastCallIndex = service.indexOf('this.readRemoteDirectoryWithFreshFastClient', listCoreIndex);
		const sharedSftpIndex = service.indexOf('this.getDirectorySftpSession', listCoreIndex);

		assert.ok(listCoreIndex >= 0);
		assert.ok(freshFastCallIndex > listCoreIndex);
		assert.ok(sharedSftpIndex > freshFastCallIndex);
		assert.ok(service.includes('private async readRemoteDirectoryWithFreshFastClient'));
		assert.ok(service.includes('private async readRemoteDirectoryFastCommand'));
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
