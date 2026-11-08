/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { getTurboFileTransferProgressView, TurboFileTransferSpeedHistory, TURBOFILE_TRANSFER_SPEED_HISTORY_LIMIT } from '../../common/turbofileTransferProgressView.js';

suite('TurboFileTransferProgressView', () => {
	test('unknown totals preserve measured bytes, speed and elapsed time without a percentage or ETA', () => {
		assert.deepStrictEqual(getTurboFileTransferProgressView({ status: 'running', transferredBytes: 1610, elapsedMs: 19000, speedBytesPerSecond: 86 }), {
			status: 'running', transferredBytes: 1610, totalBytes: undefined, elapsedMs: 19000, speedBytesPerSecond: 86,
			fraction: undefined, percentage: undefined, remainingMs: undefined
		});
	});

	test('known totals calculate progress and a rate-based estimate from the same snapshot', () => {
		assert.deepStrictEqual(getTurboFileTransferProgressView({ status: 'running', transferredBytes: 620, totalBytes: 1000, elapsedMs: 19000, speedBytesPerSecond: 100 }), {
			status: 'running', transferredBytes: 620, totalBytes: 1000, elapsedMs: 19000, speedBytesPerSecond: 100,
			fraction: 0.62, percentage: 62, remainingMs: 3800
		});
	});

	test('reaching or exceeding the counter total waits for backend success before showing 100 percent', () => {
		const base = { transferredBytes: 1000, totalBytes: 1000, elapsedMs: 19000, speedBytesPerSecond: 100 };
		assert.deepStrictEqual([
			getTurboFileTransferProgressView({ ...base, status: 'running' }),
			getTurboFileTransferProgressView({ ...base, transferredBytes: 1100, status: 'running' }),
			getTurboFileTransferProgressView({ ...base, status: 'success' })
		].map(view => ({ status: view.status, fraction: view.fraction, percentage: view.percentage, remainingMs: view.remainingMs })), [
			{ status: 'finishing', fraction: 0.99, percentage: 99, remainingMs: undefined },
			{ status: 'finishing', fraction: 0.99, percentage: 99, remainingMs: undefined },
			{ status: 'success', fraction: 1, percentage: 100, remainingMs: undefined }
		]);
	});

	test('an empty file cannot divide by zero or complete before its backend confirms success', () => {
		const base = { transferredBytes: 0, totalBytes: 0, elapsedMs: 0, speedBytesPerSecond: 0 };
		assert.deepStrictEqual(['waiting', 'running', 'success'].map(status => getTurboFileTransferProgressView({ ...base, status: status as 'waiting' | 'running' | 'success' })), [
			{ ...base, status: 'waiting', fraction: 0, percentage: 0, remainingMs: undefined },
			{ ...base, status: 'finishing', fraction: 0, percentage: 0, remainingMs: undefined },
			{ ...base, status: 'success', fraction: 1, percentage: 100, remainingMs: undefined }
		]);
	});

	test('unknown total success is reported without inventing a denominator', () => {
		assert.deepStrictEqual(getTurboFileTransferProgressView({ status: 'success', transferredBytes: 1610, elapsedMs: 19000, speedBytesPerSecond: 0 }), {
			status: 'success', transferredBytes: 1610, totalBytes: undefined, elapsedMs: 19000, speedBytesPerSecond: 0,
			fraction: undefined, percentage: undefined, remainingMs: undefined
		});
	});

	test('quiet, waiting, failed and canceled transfers never display a stale completion estimate', () => {
		assert.deepStrictEqual([
			getTurboFileTransferProgressView({ status: 'running', transferredBytes: 500, totalBytes: 1000, elapsedMs: 5000, speedBytesPerSecond: 0 }),
			...(['waiting', 'error', 'canceled'] as const).map(status => getTurboFileTransferProgressView({ status, transferredBytes: 500, totalBytes: 1000, elapsedMs: 5000, speedBytesPerSecond: 100 }))
		].map(view => view.remainingMs), [undefined, undefined, undefined, undefined]);
	});

	test('malformed metrics do not turn into invalid canvas coordinates or invented totals', () => {
		assert.deepStrictEqual([NaN, Infinity, -1].map(totalBytes => getTurboFileTransferProgressView({ status: 'running', transferredBytes: NaN, totalBytes, elapsedMs: -1, speedBytesPerSecond: Infinity })), Array.from({ length: 3 }, () => ({
			status: 'running', transferredBytes: 0, totalBytes: undefined, elapsedMs: 0, speedBytesPerSecond: 0,
			fraction: undefined, percentage: undefined, remainingMs: undefined
		})));
	});

	test('a mathematically overflowing estimate is omitted', () => {
		assert.strictEqual(getTurboFileTransferProgressView({ status: 'running', transferredBytes: 0, totalBytes: Number.MAX_VALUE, elapsedMs: 0, speedBytesPerSecond: Number.MIN_VALUE }).remainingMs, undefined);
	});
});

suite('TurboFileTransferSpeedHistory', () => {
	test('unrelated renders in the same half-second retain a single cached sample', () => {
		const history = new TurboFileTransferSpeedHistory();
		assert.deepStrictEqual(history.read(), []);
		history.sample('task:upload', 0, 10);
		const first = history.read();
		assert.deepStrictEqual([history.sample('task:upload', 499, 999), history.read() === first, history.sample('task:upload', 500, 20)], [false, true, true]);
		assert.deepStrictEqual(history.read(), [{ elapsedMs: 0, speedBytesPerSecond: 10 }, { elapsedMs: 500, speedBytesPerSecond: 20 }]);
	});

	test('long transfers retain only the newest 120 points in chronological order', () => {
		const history = new TurboFileTransferSpeedHistory();
		for (let index = 0; index < 1000; index++) {
			history.sample('task:upload', index * 500, index);
		}
		const points = history.read();
		assert.deepStrictEqual({ count: points.length, first: points[0], last: points[points.length - 1] }, {
			count: TURBOFILE_TRANSFER_SPEED_HISTORY_LIMIT,
			first: { elapsedMs: 440000, speedBytesPerSecond: 880 },
			last: { elapsedMs: 499500, speedBytesPerSecond: 999 }
		});
	});

	test('long sampling gaps evict expired points instead of filling the gap with invented data', () => {
		const history = new TurboFileTransferSpeedHistory();
		history.sample('task:upload', 0, 10);
		history.sample('task:upload', 500, 20);
		history.sample('task:upload', 61000, 30);
		assert.deepStrictEqual(history.read(), [{ elapsedMs: 61000, speedBytesPerSecond: 30 }]);
	});

	test('a new task, changed relay stage or backwards clock starts a separate curve', () => {
		const history = new TurboFileTransferSpeedHistory();
		history.sample('task1:download', 1000, 10);
		history.sample('task1:upload', 1500, 20);
		const stage = history.read();
		history.sample('task2:upload', 2000, 30);
		const task = history.read();
		history.sample('task2:upload', 100, 40);
		assert.deepStrictEqual([stage, task, history.read()], [
			[{ elapsedMs: 1500, speedBytesPerSecond: 20 }],
			[{ elapsedMs: 2000, speedBytesPerSecond: 30 }],
			[{ elapsedMs: 100, speedBytesPerSecond: 40 }]
		]);
	});

	test('invalid timestamps are ignored and invalid rates become zero without corrupting existing history', () => {
		const history = new TurboFileTransferSpeedHistory();
		history.sample('task:upload', 0, 10);
		assert.deepStrictEqual([NaN, Infinity, -1].map(elapsed => history.sample('other-task:upload', elapsed, 999)), [false, false, false]);
		history.sample('task:upload', 500, Infinity);
		history.sample('task:upload', 1000, -1);
		assert.deepStrictEqual(history.read(), [
			{ elapsedMs: 0, speedBytesPerSecond: 10 },
			{ elapsedMs: 500, speedBytesPerSecond: 0 },
			{ elapsedMs: 1000, speedBytesPerSecond: 0 }
		]);
	});

	test('reset releases all samples and starts a new sampling bucket', () => {
		const history = new TurboFileTransferSpeedHistory();
		history.sample('task:upload', 1000, 10);
		history.reset();
		const empty = history.read();
		history.sample('task:upload', 1000, 20);
		assert.deepStrictEqual([empty, history.read()], [[], [{ elapsedMs: 1000, speedBytesPerSecond: 20 }]]);
	});
});
