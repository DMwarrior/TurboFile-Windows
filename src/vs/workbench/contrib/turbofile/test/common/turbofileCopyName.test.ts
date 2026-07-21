/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { createTurboFileCopyName, createTurboFileCopyNames } from '../../common/turbofileCopyName.js';

suite('TurboFileCopyName', () => {
	test('creates Windows-style names for files and folders', () => {
		assert.strictEqual(createTurboFileCopyName('图片.png', false, [], true), '图片 - 副本.png');
		assert.strictEqual(createTurboFileCopyName('图片素材', true, [], true), '图片素材 - 副本');
	});

	test('uses the next available copy number', () => {
		assert.strictEqual(createTurboFileCopyName('报告.txt', false, [
			'报告.txt',
			'报告 - 副本.txt',
			'报告 - 副本 (2).txt',
			'报告 - 副本 (4).txt'
		], true), '报告 - 副本 (3).txt');
	});

	test('supports case-insensitive Windows names without changing SSH semantics', () => {
		const occupied = ['PHOTO - 副本.JPG'];
		assert.strictEqual(createTurboFileCopyName('photo.JPG', false, occupied, false), 'photo - 副本 (2).JPG');
		assert.strictEqual(createTurboFileCopyName('photo.JPG', false, occupied, true), 'photo - 副本.JPG');
	});

	test('treats dotfiles as names without extensions', () => {
		assert.strictEqual(createTurboFileCopyName('.env', false, [], true), '.env - 副本');
	});

	test('allocates unique names for a batch against one directory snapshot', () => {
		assert.deepStrictEqual(createTurboFileCopyNames([
			{ name: '图片.png', directory: false },
			{ name: '图片.png', directory: false },
			{ name: '素材', directory: true }
		], ['图片.png', '素材'], true), [
			'图片 - 副本.png',
			'图片 - 副本 (2).png',
			'素材 - 副本'
		]);
	});

	test('integrates naming only into internal same-directory copy paste', () => {
		const editor = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');
		const paste = editor.slice(editor.indexOf('private async pasteInternalTransferClipboard'), editor.indexOf('private isSameTransferTarget'));
		const allocator = editor.slice(editor.indexOf('private createSameDirectoryCopyItems'), editor.indexOf('private async pasteInternalTransferClipboard'));

		assert.deepStrictEqual({
			pasteUsesAllocator: paste.includes('this.createSameDirectoryCopyItems(clipboard, targetSide, targetDevice)'),
			copyOnly: allocator.includes("clipboard.operation !== 'copy'"),
			sameDeviceOnly: allocator.includes('this.isSameDeviceForNativeOperation(clipboard.sourceDevice, targetDevice)'),
			sameDirectoryOnly: allocator.includes('this.pathsEqualForDevice(clipboard.sourcePath, targetState.path'),
			usesCopyNames: allocator.includes('createTurboFileCopyNames(')
		}, {
			pasteUsesAllocator: true,
			copyOnly: true,
			sameDeviceOnly: true,
			sameDirectoryOnly: true,
			usesCopyNames: true
		});
	});
});
