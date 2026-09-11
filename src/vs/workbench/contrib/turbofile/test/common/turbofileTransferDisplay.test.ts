/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { chooseDisplayTransferSpeed, createTurboFileTransferSizePolicy, getVisibleTransferStartedAt, resolveTurboFileVisibleTotalBytes, shouldStartTransferTiming, TurboFileTransferTimeDisplay } from '../../common/turbofileTransferDisplay.js';

suite('TurboFileTransferDisplay', () => {
	test('shares one elapsed-time sample across interleaved event and heartbeat renders', () => {
		const display = new TurboFileTransferTimeDisplay();
		const values = [12100, 13000, 13050, 13100, 13130, 14000, 14100].map(now => display.read(0, undefined, now).milliseconds);
		assert.deepStrictEqual(values, [12100, 12100, 12100, 13100, 13100, 13100, 14100]);
	});

	test('late callbacks preserve tenths and catch up without replaying intermediate samples', () => {
		const display = new TurboFileTransferTimeDisplay();
		assert.deepStrictEqual([12100, 13240, 14210, 18900, 18100].map(now => display.read(0, undefined, now).milliseconds), [12100, 13100, 14100, 18100, 18100]);
	});

	test('remaining time and its label stay atomic between display ticks', () => {
		const display = new TurboFileTransferTimeDisplay();
		assert.deepStrictEqual([
			display.read(0, 12100, 1000),
			display.read(0, 13000, 1500),
			display.read(0, undefined, 1900),
			display.read(0, 13100, 2000)
		], [
			{ remaining: true, milliseconds: 12100 },
			{ remaining: true, milliseconds: 12100 },
			{ remaining: true, milliseconds: 12100 },
			{ remaining: true, milliseconds: 13100 }
		]);
	});

	test('new transfers and reset never reuse the preceding transfer time', () => {
		const display = new TurboFileTransferTimeDisplay();
		display.read(0, undefined, 12100);
		const newTransfer = display.read(13000, undefined, 13100);
		display.reset();
		assert.deepStrictEqual([newTransfer, display.read(13000, undefined, 13200)], [
			{ remaining: false, milliseconds: 100 },
			{ remaining: false, milliseconds: 200 }
		]);
	});

	test('tracks a total only for exactly one ordinary file', () => {
		assert.deepStrictEqual(createTurboFileTransferSizePolicy([{ directory: false, rawSize: 4096 }]), {
			trackTotalBytes: true,
			totalBytes: 4096
		});
		assert.deepStrictEqual(createTurboFileTransferSizePolicy([{ directory: true, rawSize: 0 }]), { trackTotalBytes: false });
		assert.deepStrictEqual(createTurboFileTransferSizePolicy([
			{ directory: false, rawSize: 10 },
			{ directory: false, rawSize: 20 }
		]), { trackTotalBytes: false });
	});

	test('never exposes a protocol-reported total for an unknown-total selection', () => {
		assert.strictEqual(resolveTurboFileVisibleTotalBytes({
			trackTotalBytes: false,
			listedTotalBytes: 0,
			reportedTotalBytes: 8192
		}), undefined);
	});

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
