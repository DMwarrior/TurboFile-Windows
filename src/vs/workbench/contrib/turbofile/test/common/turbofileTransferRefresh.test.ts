/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { createTurboFilePostTransferRefreshPlan } from '../../common/turbofileTransferRefresh.js';

suite('TurboFileTransferRefresh', () => {
	test('copy refreshes only the target pane', () => {
		assert.deepStrictEqual(createTurboFilePostTransferRefreshPlan('copy', 'left', 'right'), ['right']);
	});

	test('cross-pane move refreshes source and target', () => {
		assert.deepStrictEqual(createTurboFilePostTransferRefreshPlan('move', 'left', 'right'), ['left', 'right']);
	});

	test('same-pane move refreshes the pane once', () => {
		assert.deepStrictEqual(createTurboFilePostTransferRefreshPlan('move', 'left', 'left'), ['left']);
	});
});
