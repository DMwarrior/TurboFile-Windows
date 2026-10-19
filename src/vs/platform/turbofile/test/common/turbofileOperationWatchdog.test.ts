/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import { DeferredPromise } from '../../../../base/common/async.js';
import { TurboFileOperationWatchdog } from '../../common/turbofileOperationWatchdog.js';

suite('TurboFileOperationWatchdog', () => {
	let clock: sinon.SinonFakeTimers;
	let watchdog: TurboFileOperationWatchdog;
	let abortCount: number;

	setup(() => {
		clock = sinon.useFakeTimers();
		abortCount = 0;
		watchdog = new TurboFileOperationWatchdog(() => abortCount++);
	});

	teardown(() => {
		watchdog.fail(new Error('Test transport closed.'));
		clock.restore();
	});

	test('silent request aborts the transport, all concurrent requests and future cleanup', async () => {
		const missingCallback = new DeferredPromise<void>();
		const first = assert.rejects(watchdog.run(() => missingCallback.p, 3000, 'SFTP timed out'), /SFTP timed out/);
		const second = assert.rejects(watchdog.run(() => missingCallback.p, 6000, 'other timeout'), /SFTP timed out/);
		await clock.tickAsync(3000);
		await Promise.all([first, second]);
		let cleanupStarted = false;
		await assert.rejects(watchdog.run(async () => { cleanupStarted = true; }, 3000, 'cleanup'), /SFTP timed out/);
		await missingCallback.complete(); // Late callbacks must not resurrect a failed transport.
		assert.deepStrictEqual({ abortCount, cleanupStarted, timers: clock.countTimers() }, { abortCount: 1, cleanupStarted: false, timers: 0 });
	});

	test('progress keeps a long transfer alive beyond its initial deadline', async () => {
		const transfer = new DeferredPromise<string>();
		let reportActivity = () => { };
		const result = watchdog.run(report => { reportActivity = report; return transfer.p; }, 3000, 'stalled');
		for (let step = 0; step < 5; step++) {
			await clock.tickAsync(2000);
			reportActivity();
		}
		await transfer.complete('done');
		assert.deepStrictEqual({ result: await result, abortCount, timers: clock.countTimers() }, { result: 'done', abortCount: 0, timers: 0 });
	});

	test('progress on another request cannot hide a stuck write acknowledgement', async () => {
		let reportActivity = () => { };
		const silent = assert.rejects(watchdog.run(() => new Promise<void>(() => undefined), 3000, 'write timed out'), /write timed out/);
		const active = assert.rejects(watchdog.run(report => { reportActivity = report; return new Promise<void>(() => undefined); }, 3000, 'read timed out'), /write timed out/);
		await clock.tickAsync(2000);
		reportActivity();
		await clock.tickAsync(1000);
		await Promise.all([silent, active]);
		assert.strictEqual(abortCount, 1);
	});

	test('connection close immediately releases pending requests without their callbacks', async () => {
		const request = assert.rejects(watchdog.run(() => new Promise<void>(() => undefined), 30000, 'timeout'), /connection closed/);
		watchdog.fail(new Error('connection closed'));
		await request;
		assert.deepStrictEqual({ abortCount, timers: clock.countTimers() }, { abortCount: 0, timers: 0 });
	});

	test('ordinary and synchronous errors release timers without poisoning a usable connection', async () => {
		await assert.rejects(watchdog.run(async () => { throw new Error('permission denied'); }, 3000, 'timeout'), /permission denied/);
		await assert.rejects(watchdog.run(() => { throw new Error('invalid request'); }, 3000, 'timeout'), /invalid request/);
		assert.deepStrictEqual({ result: await watchdog.run(async () => 'ok', 3000, 'timeout'), abortCount, timers: clock.countTimers() }, { result: 'ok', abortCount: 0, timers: 0 });
	});

	test('an abort that throws still rejects the request and clears timers', async () => {
		watchdog = new TurboFileOperationWatchdog(() => { throw new Error('already closed'); });
		const request = assert.rejects(watchdog.run(() => new Promise<void>(() => undefined), 3000, 'timeout'), /timeout/);
		await clock.tickAsync(3000);
		await request;
		assert.strictEqual(clock.countTimers(), 0);
	});
});
