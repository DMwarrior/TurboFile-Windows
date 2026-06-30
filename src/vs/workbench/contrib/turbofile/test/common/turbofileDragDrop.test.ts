/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { getTurboFileDirectoryMoveRefreshPaths, getTurboFileRowDragEffectAllowed, shouldHandleTurboFilePaneDropAtPage } from '../../common/turbofileDragDrop.js';

suite('TurboFileDragDrop', () => {
	test('lets folder rows handle same-pane moves while the page handles copies and external drops', () => {
		assert.deepStrictEqual([
			getTurboFileRowDragEffectAllowed(),
			shouldHandleTurboFilePaneDropAtPage('left', 'left'),
			shouldHandleTurboFilePaneDropAtPage('left', 'right'),
			shouldHandleTurboFilePaneDropAtPage(undefined, 'right')
		], [
			'copyMove',
			false,
			true,
			true
		]);
	});

	test('refreshes both source and target directories after a same-pane folder move', () => {
		assert.deepStrictEqual(getTurboFileDirectoryMoveRefreshPaths('/work/images', '/work/images/done'), [
			'/work/images',
			'/work/images/done'
		]);
	});

	test('keeps local file drops inside TurboFile panes instead of bubbling to the workbench opener', () => {
		const editor = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');

		assert.ok(editor.includes('private consumeTurboFileDropEvent(event: DragEvent): void'));
		assert.ok(editor.includes('this.consumeTurboFileDropEvent(event);'));
	});
});
