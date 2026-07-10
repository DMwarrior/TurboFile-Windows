/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { createTurboFilePostTransferRefreshPlan } from '../../common/turbofileTransferRefresh.js';

suite('TurboFileTransferRefresh', () => {
	test('copy refreshes only the target pane', () => {
		assert.deepStrictEqual(createTurboFilePostTransferRefreshPlan('copy', 'left', 'right', true), {
			sides: ['right'],
			sequential: false
		});
	});

	test('same-device move refreshes source and target sequentially', () => {
		assert.deepStrictEqual(createTurboFilePostTransferRefreshPlan('move', 'left', 'right', true), {
			sides: ['left', 'right'],
			sequential: true
		});
	});

	test('cross-device move may refresh source and target concurrently', () => {
		assert.deepStrictEqual(createTurboFilePostTransferRefreshPlan('move', 'left', 'right', false), {
			sides: ['left', 'right'],
			sequential: false
		});
	});

	test('a move within one pane refreshes that pane once', () => {
		assert.deepStrictEqual(createTurboFilePostTransferRefreshPlan('move', 'left', 'left', true), {
			sides: ['left'],
			sequential: false
		});
	});
});
