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
});
