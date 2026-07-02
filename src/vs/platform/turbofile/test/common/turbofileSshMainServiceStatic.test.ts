/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('TurboFileSshMainServiceStatic', () => {
	const servicePath = () => path.join(process.cwd(), 'src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts');

	test('lists remote directories through the shared SFTP session without opening a fresh SSH client first', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const listCoreIndex = service.indexOf('private async listRemoteDirectoryCore');
		const sharedSftpIndex = service.indexOf('this.getDirectorySftpSession', listCoreIndex);
		const fallbackIndex = service.indexOf('this.readRemoteDirectoryWithFallback(session.sftp, session.client', sharedSftpIndex);

		assert.ok(listCoreIndex >= 0);
		assert.ok(sharedSftpIndex > listCoreIndex);
		assert.ok(fallbackIndex > sharedSftpIndex);
		assert.ok(!service.includes('readRemoteDirectoryWithFreshFastClient'));
		assert.ok(!service.includes('readRemoteDirectoryFastCommand'));
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
