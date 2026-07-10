/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('TurboFileSameDeviceMergeStatic', () => {
	const servicePath = () => path.join(process.cwd(), 'src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts');
	const methodBlock = (service: string, methodName: string): string => {
		const start = service.indexOf(`private async ${methodName}`);
		assert.ok(start >= 0, `${methodName} should exist`);
		const next = service.indexOf('\n\tprivate async ', start + 1);
		return service.slice(start, next === -1 ? service.length : next);
	};

	test('uses exact-target Windows merge commands for same-device directory copies', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const sameRemoteCopy = methodBlock(service, 'trySameRemoteCopy');
		const windowsCopyStart = service.indexOf('function buildWindowsCopyCommand');
		const windowsCopyEnd = service.indexOf('\nfunction buildWindowsMoveCommand', windowsCopyStart);
		const windowsCopy = service.slice(windowsCopyStart, windowsCopyEnd);
		const windowsBatchStart = service.indexOf('function buildWindowsBatchCommand');
		const windowsBatchEnd = service.indexOf('\nfunction buildWindowsBatchDeleteCommand', windowsBatchStart);
		const windowsBatch = service.slice(windowsBatchStart, windowsBatchEnd);

		assert.ok(sameRemoteCopy.includes('buildWindowsCopyCommand(request.source.path, request.target.path, sourceType)'), 'single same-device copies should pass source type to the Windows command builder');
		assert.ok(windowsCopy.includes('sourceType: TurboFileFileType'), 'Windows copy builder should distinguish directories from files');
		assert.ok(windowsCopy.includes('Get-ChildItem -LiteralPath $src -Force'), 'Windows directory copies should enumerate source contents');
		assert.ok(windowsCopy.includes('Copy-Item -LiteralPath $_.FullName -Destination $dst -Force -Recurse'), 'Windows directory contents should merge into the exact target');
		assert.ok(windowsBatch.includes('items: readonly ITurboFileBatchTransferItem[]'), 'Windows batch copy should preserve each target name and source type');
	});

	test('checks directory conflicts again before local and relay SFTP fallbacks', () => {
		const service = fs.readFileSync(servicePath(), 'utf8');
		const transferFileStart = service.indexOf('async transferFile');
		const transferFileEnd = service.indexOf('\n\tprivate async transferBetweenSshDevices', transferFileStart);
		const transferFile = service.slice(transferFileStart, transferFileEnd);
		const uploadIndex = transferFile.indexOf('uploadDirectoryConcurrent');
		const downloadIndex = transferFile.indexOf('downloadDirectoryConcurrent');
		const sftpRelay = methodBlock(service, 'runSftpRelayTransfer');
		const relayUploadIndex = sftpRelay.indexOf('uploadDirectory(sftp, relayPath, request.target.path');

		assert.ok(transferFile.lastIndexOf('rejectDirectoryTargetPathConflict', uploadIndex) >= 0, 'local-to-SSH SFTP directory fallback should reject an existing target');
		assert.ok(transferFile.lastIndexOf('rejectDirectoryTargetPathConflict', downloadIndex) > uploadIndex, 'SSH-to-local SFTP directory fallback should reject an existing target');
		assert.ok(sftpRelay.lastIndexOf('rejectDirectoryTargetPathConflict', relayUploadIndex) >= 0, 'SFTP directory relay should reject an existing target before upload');
	});
});
