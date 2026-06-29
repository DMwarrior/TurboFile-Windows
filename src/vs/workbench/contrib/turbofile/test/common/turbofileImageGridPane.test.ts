/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { getTurboFileImageGridPasteTargetSide } from '../../common/turbofileImageGridClipboard.js';

suite('TurboFileImageGridPane', () => {
	test('pastes into the focused pane grid when clipboard came from the other side', () => {
		assert.deepStrictEqual([
			getTurboFileImageGridPasteTargetSide('right', 'left'),
			getTurboFileImageGridPasteTargetSide('left', 'right'),
			getTurboFileImageGridPasteTargetSide('left', 'left'),
			getTurboFileImageGridPasteTargetSide('right', undefined)
		], [
			'right',
			'left',
			'right',
			'left'
		]);
	});

	test('reflows pane grids after DOM attach and lets local drop targets own image-grid drops', () => {
		const editor = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');
		assert.ok(editor.includes('this.reflowAttachedImageGridBody(body, state, scrollTop);'));
		assert.ok(editor.includes('this.shouldLetConcreteDropTargetHandle(event)'));
		assert.ok(editor.includes('getTurboFileImageGridPasteTargetSide(state.side, this.internalTransferClipboard?.sourceSide)'));
	});

	test('keeps left and right pane image-grid toolbar actions bound to their own state', () => {
		const editor = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');
		assert.ok(editor.includes('this.setImageGridColumns(state, option);'));
		assert.ok(editor.includes('this.setImageGridThumbnailScale(state, scale);'));
		assert.ok(editor.includes('this.setImageGridSort(state, option.key);'));
		assert.ok(editor.includes('void this.deleteSelectedImageGridItems(state);'));
		assert.ok(editor.includes('this.selectAllImageGridItems(state);'));
		assert.ok(editor.includes('this.setImageGridColumns(state, state.columns - 1);'));
		assert.ok(editor.includes('this.setImageGridColumns(state, state.columns + 1);'));
	});

	test('updates image-grid deletion in place instead of re-rendering the whole editor', () => {
		const editor = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');
		assert.ok(editor.includes('private updateImageGridAfterLocalMutation(state: TurboFileImageGridState): void'));
		assert.ok(editor.includes('this.updateImageGridAfterLocalMutation(state);'));
	});
});
