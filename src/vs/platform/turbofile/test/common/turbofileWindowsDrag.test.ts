/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { createWindowsDragFakeDirectoryName, createWindowsShellAssociationChangedScript, extractWindowsDragTokenFromFakeDirectoryPath, isValidWindowsDragToken, normalizeWindowsCopyHookDestination } from '../../common/turbofileWindowsDrag.js';

suite('TurboFileWindowsDrag', function () {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('creates and recognizes TurboFile fake drag folders', () => {
		const token = '7f02b77c-1d20-49a0-a16f-c82302df6cf6';
		const fakeName = createWindowsDragFakeDirectoryName(token);

		assert.strictEqual(fakeName, 'TurboFileDrop-7f02b77c-1d20-49a0-a16f-c82302df6cf6');
		assert.strictEqual(extractWindowsDragTokenFromFakeDirectoryPath(`C:\\Users\\me\\AppData\\Local\\TurboFile\\DragDrop\\Active\\${token}\\${fakeName}`), token);
		assert.strictEqual(extractWindowsDragTokenFromFakeDirectoryPath(`C:\\Temp\\${fakeName}\\`), token);
	});

	test('validates drag tokens before they are used in rendezvous paths', () => {
		assert.strictEqual(isValidWindowsDragToken('7f02b77c-1d20-49a0-a16f-c82302df6cf6'), true);
		assert.strictEqual(isValidWindowsDragToken('abc_DEF-123'), true);
		assert.strictEqual(isValidWindowsDragToken('../abc'), false);
		assert.strictEqual(isValidWindowsDragToken('abc\\def'), false);
		assert.strictEqual(isValidWindowsDragToken(''), false);
	});

	test('normalizes Explorer CopyHook destination back to the real drop directory', () => {
		const fakeName = createWindowsDragFakeDirectoryName('abc-123');

		assert.strictEqual(normalizeWindowsCopyHookDestination(`C:\\Users\\me\\Desktop\\${fakeName}`, fakeName), 'C:\\Users\\me\\Desktop');
		assert.strictEqual(normalizeWindowsCopyHookDestination(`C:\\Users\\me\\Desktop\\${fakeName}\\`, fakeName), 'C:\\Users\\me\\Desktop');
		assert.strictEqual(normalizeWindowsCopyHookDestination('C:\\Users\\me\\Desktop', fakeName), 'C:\\Users\\me\\Desktop');
		assert.strictEqual(normalizeWindowsCopyHookDestination('D:\\', fakeName), 'D:\\');
	});

	test('creates a Shell association refresh script for CopyHook registration', () => {
		const script = createWindowsShellAssociationChangedScript();

		assert.match(script, /SHChangeNotify/);
		assert.match(script, /0x08000000/);
		assert.match(script, /shell32\.dll/i);
	});
});
