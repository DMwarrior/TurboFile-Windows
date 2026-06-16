/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { getTurboFileRowDragEffectAllowed, shouldHandleTurboFilePaneDropAtPage } from '../../common/turbofileDragDrop.js';

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
});
