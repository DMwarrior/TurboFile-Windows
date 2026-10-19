/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { aggregateTurboFileTransferProgress, chooseDisplayTransferSpeed, createTurboFileTransferSizePolicy, getVisibleTransferStartedAt, isTurboFileTransferProgressQuiet, resolveTurboFileVisibleTotalBytes, shouldStartTransferTiming, trimTurboFileTaskHistory, TurboFileTransferMetricsDisplay, TurboFileTransferTimeDisplay, TURBOFILE_TRANSFER_LIVE_TICK_INTERVAL_MS } from '../../common/turbofileTransferDisplay.js';

suite('TurboFileTransferDisplay', () => {
	test('single-folder batches display task counters rather than untouched child counters', () => {
		const task = { status: 'running' as const, trackTotalBytes: false, startedAt: 0, lastProgressAt: 1000, transferredBytes: 1024, speedBytesPerSecond: 512,
			transferItems: [{ status: 'running' as const, transferredBytes: 0, speedBytesPerSecond: 0 }] };
		assert.deepStrictEqual(aggregateTurboFileTransferProgress([task], 1100), {
			transferredBytes: 1024, totalBytes: undefined, speedBytesPerSecond: 512, remainingMs: undefined, startedAt: 0
		});
	});

	test('per-item transfers aggregate only their authoritative child counters', () => {
		assert.deepStrictEqual(aggregateTurboFileTransferProgress([{
			status: 'running', trackTotalBytes: true, startedAt: 0, transferredBytes: 9999, activeTransferItemIndex: 1,
			transferItems: [
				{ status: 'success', transferredBytes: 100, totalBytes: 100, speedBytesPerSecond: 999 },
				{ status: 'running', transferredBytes: 50, totalBytes: 100, speedBytesPerSecond: 50, lastProgressAt: 1000 }
			]
		}], 1100), { transferredBytes: 150, totalBytes: 200, speedBytesPerSecond: 50, remainingMs: 1000, startedAt: 0 });
	});

	test('quiet transfers retain actual bytes and elapsed time but not stale speed or ETA', () => {
		const task = { status: 'running' as const, trackTotalBytes: true, totalBytes: 2048, startedAt: 0, lastProgressAt: 1000, transferredBytes: 1024, speedBytesPerSecond: 512 };
		assert.deepStrictEqual([4999, 5000, 6000].map(now => isTurboFileTransferProgressQuiet(0, now)), [false, true, true]);
		assert.deepStrictEqual(aggregateTurboFileTransferProgress([task], 6000), {
			transferredBytes: 1024, totalBytes: 2048, speedBytesPerSecond: 0, remainingMs: undefined, startedAt: 0
		});
		assert.strictEqual(aggregateTurboFileTransferProgress([{ ...task, lastProgressAt: 6100 }], 6100).speedBytesPerSecond, 512);
	});

	test('all active routes keep a visible clock before first data without inventing progress', () => {
		assert.deepStrictEqual(aggregateTurboFileTransferProgress([{ status: 'running', trackTotalBytes: false, startedAt: 1000 }], 9000), {
			transferredBytes: 0, totalBytes: undefined, speedBytesPerSecond: 0, remainingMs: undefined, startedAt: 1000
		});
	});

	test('history limits never discard active tasks or their cancel controls', () => {
		const tasks = Array.from({ length: 20 }, (_, id) => ({ id, status: 'running' }));
		trimTurboFileTaskHistory(tasks, 16);
		assert.strictEqual(tasks.length, 20);
		tasks[19].status = 'success';
		tasks[17].status = 'error';
		trimTurboFileTaskHistory(tasks, 16);
		assert.deepStrictEqual(tasks.map(task => task.id), [...Array.from({ length: 17 }, (_, id) => id), 18]);
	});
	test('shares one elapsed-time sample across interleaved event and heartbeat renders', () => {
		const display = new TurboFileTransferTimeDisplay();
		const values = [12100, 13000, 13050, 13100, 13130, 14000, 14100].map(now => display.read(0, undefined, now).milliseconds);
		assert.deepStrictEqual(values, [12100, 12600, 12600, 13100, 13100, 13600, 14100]);
	});

	test('late callbacks preserve tenths and catch up without replaying intermediate samples', () => {
		const display = new TurboFileTransferTimeDisplay();
		assert.deepStrictEqual([12100, 13240, 14210, 18900, 18100].map(now => display.read(0, undefined, now).milliseconds), [12100, 13100, 14100, 18600, 18600]);
	});

	test('remaining time and its label stay atomic between display ticks', () => {
		const display = new TurboFileTransferTimeDisplay();
		assert.deepStrictEqual([
			display.read(0, 12100, 1000),
			display.read(0, 13000, 1200),
			display.read(0, undefined, 1400),
			display.read(0, 13100, 1500)
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

	test('keeps non-rsync data timing and smooths its speed from byte deltas', () => {
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
		}), 100);
	});

	test('snapshots speed bytes and time together at 500 ms, regardless of event arrival', () => {
		const display = new TurboFileTransferMetricsDisplay();
		const metrics = (bytes: number) => ({ transferredBytes: bytes, speedBytesPerSecond: bytes * 2, startedAt: 0 });
		const initial = display.read('task-1', metrics(0), 0);
		const beforeTick = display.read('task-1', metrics(40), 499);
		display.advance();
		const firstTick = display.read('task-1', metrics(50), 500);
		const betweenTicks = display.read('task-1', metrics(99), 999);
		display.advance();
		const secondTick = display.read('task-1', metrics(100), 1000);
		assert.deepStrictEqual({ interval: TURBOFILE_TRANSFER_LIVE_TICK_INTERVAL_MS, initial, beforeTick, firstTick, betweenTicks, secondTick }, {
			interval: 500,
			initial: { ...metrics(0), time: { milliseconds: 0, remaining: false } },
			beforeTick: { ...metrics(0), time: { milliseconds: 0, remaining: false } },
			firstTick: { ...metrics(50), time: { milliseconds: 500, remaining: false } },
			betweenTicks: { ...metrics(50), time: { milliseconds: 500, remaining: false } },
			secondTick: { ...metrics(100), time: { milliseconds: 1000, remaining: false } }
		});
	});

	test('first bytes and recovery can publish immediately without enabling event-driven refresh', () => {
		const display = new TurboFileTransferMetricsDisplay();
		const metrics = { transferredBytes: 10, speedBytesPerSecond: 50, startedAt: 0 };
		display.read('task', { ...metrics, transferredBytes: 0 }, 0);
		display.advance();
		const first = display.read('task', metrics, 20);
		assert.strictEqual(display.read('task', { ...metrics, transferredBytes: 50 }, 300), first);
		display.reset();
		assert.strictEqual(display.read('task', { ...metrics, transferredBytes: 50 }, 300).transferredBytes, 50);
		assert.strictEqual(display.read('new-task', { ...metrics, transferredBytes: 0 }, 350).transferredBytes, 0);
	});

	test('uses smoothed sampled speed for rsync display', () => {
		assert.strictEqual(chooseDisplayTransferSpeed({
			strategy: 'rsync-upload',
			eventSpeedBytesPerSecond: 200,
			sampledSpeedBytesPerSecond: 100
		}), 100);
	});
});
