/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { getVisibleTransferStartedAt, shouldStartTransferTiming, chooseDisplayTransferSpeed } from '../../common/turbofileTransferDisplay.js';

suite('TurboFileTransferDisplay', () => {
	test('shows rsync as visibly started before first bytes without starting data timing', () => {
		assert.strictEqual(shouldStartTransferTiming({
			phase: 'transfer',
			strategy: 'rsync-upload',
			transferredBytes: 0,
			speedBytesPerSecond: 0
		}), false);

		assert.strictEqual(getVisibleTransferStartedAt({
			status: 'running',
			strategy: 'rsync-upload',
			startedAt: 1000,
			transferStartedAt: undefined
		}), 1000);
	});

	test('starts rsync data timing once bytes or speed appears', () => {
		assert.strictEqual(shouldStartTransferTiming({
			phase: 'transfer',
			strategy: 'rsync-upload',
			transferredBytes: 1,
			speedBytesPerSecond: 0
		}), true);

		assert.strictEqual(shouldStartTransferTiming({
			phase: 'transfer',
			strategy: 'rsync-upload',
			transferredBytes: 0,
			speedBytesPerSecond: 1
		}), true);
	});

	test('keeps non-rsync data timing and event speed behavior unchanged', () => {
		assert.strictEqual(shouldStartTransferTiming({
			phase: 'transfer',
			strategy: 'scp-upload',
			transferredBytes: 0,
			speedBytesPerSecond: 0
		}), true);

		assert.strictEqual(chooseDisplayTransferSpeed({
			strategy: 'scp-upload',
			eventSpeedBytesPerSecond: 200,
			sampledSpeedBytesPerSecond: 100
		}), 200);
	});

	test('uses smoothed sampled speed for rsync display', () => {
		assert.strictEqual(chooseDisplayTransferSpeed({
			strategy: 'rsync-upload',
			eventSpeedBytesPerSecond: 200,
			sampledSpeedBytesPerSecond: 100
		}), 100);
	});
});
