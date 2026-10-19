/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import { DeferredPromise } from '../../../../base/common/async.js';
import { TurboFileRemoteCancellationError, TurboFileRemoteProcessControl } from '../../common/turbofileRemoteProcessControl.js';

suite('TurboFileRemoteProcessControl', () => {
	let clock: sinon.SinonFakeTimers;
	const nonce = 'operation-123';
	const marker = (value: string, id = nonce) => `TURBOFILE_PROCESS_GROUP_${id}=${value}\n`;

	setup(() => clock = sinon.useFakeTimers());
	teardown(() => clock.restore());

	test('rejects nonce values that could change the shell command', () => {
		for (const value of ['', 'two words', 'x;false', "x'y", 'x\ny']) {
			assert.throws(() => new TurboFileRemoteProcessControl(value), /Invalid remote process control nonce/);
		}
	});

	test('reassembles split records and preserves starttime as an exact string', async () => {
		const control = new TurboFileRemoteProcessControl(nonce);
		const commands: string[] = [];
		const startTime = '9007199254740993123456789';
		control.accept(`ordinary stderr\n${marker('777:20', 'different-operation')}`);
		const canceled = control.cancel(async command => { commands.push(command); });
		for (const chunk of ['TURBOFILE_PROCESS_', `GROUP_${nonce}=4321:`, startTime, '\r']) {
			control.accept(chunk);
		}
		await clock.tickAsync(0);
		assert.strictEqual(commands.length, 0, 'Partial or unrelated records must not authorize a kill.');
		control.accept('\n');
		await canceled;
		assert.strictEqual(commands.length, 1);
		assert.ok(commands[0].includes("pid='4321'"));
		assert.ok(commands[0].includes(`start='${startTime}'`));
		assert.strictEqual(clock.countTimers(), 0);
	});

	test('rejects unsafe PIDs and malformed starttimes without issuing a command', async () => {
		const commands: string[] = [];
		for (const value of ['0:123', '1:123', '-2:123', '2.5:123', '9007199254740992:123', '4321:1e9', '4321:-1', '4321:3;false']) {
			const control = new TurboFileRemoteProcessControl(nonce);
			control.accept(marker(value));
			await assert.rejects(control.cancel(async command => { commands.push(command); }), TurboFileRemoteCancellationError);
		}
		assert.deepStrictEqual({ commands, timers: clock.countTimers() }, { commands: [], timers: 0 });
	});

	test('a missing ownership marker times out without touching the remote process', async () => {
		const control = new TurboFileRemoteProcessControl(nonce);
		let calls = 0;
		let settled = false;
		const failure = assert.rejects(control.cancel(async () => { calls++; }), TurboFileRemoteCancellationError).then(() => settled = true);
		await clock.tickAsync(1499);
		assert.deepStrictEqual({ calls, settled }, { calls: 0, settled: false });
		await clock.tickAsync(1);
		await failure;
		assert.deepStrictEqual({ calls, settled, timers: clock.countTimers() }, { calls: 0, settled: true, timers: 0 });
	});

	test('an unavailable ownership probe rejects without waiting or inventing a PID', async () => {
		const control = new TurboFileRemoteProcessControl(nonce);
		let calls = 0;
		control.accept(marker('unavailable'));
		await assert.rejects(control.cancel(async () => { calls++; }), TurboFileRemoteCancellationError);
		assert.deepStrictEqual({ calls, timers: clock.countTimers() }, { calls: 0, timers: 0 });
	});

	test('a late valid marker permits retry after the first attempt could not confirm ownership', async () => {
		const control = new TurboFileRemoteProcessControl(nonce);
		const commands: string[] = [];
		const failure = assert.rejects(control.cancel(async command => { commands.push(command); }), TurboFileRemoteCancellationError);
		await clock.tickAsync(1500);
		await failure;
		assert.strictEqual(control.cancellation, undefined);
		control.accept(marker('4321:76543'));
		await control.cancel(async command => { commands.push(command); });
		assert.deepStrictEqual({ calls: commands.length, timers: clock.countTimers() }, { calls: 1, timers: 0 });
	});

	test('a failed confirmation command is not cached as successful cancellation', async () => {
		const control = new TurboFileRemoteProcessControl(nonce);
		const commands: string[] = [];
		control.accept(marker('4321:76543'));
		await assert.rejects(control.cancel(async command => {
			commands.push(command);
			throw new Error('Control channel failed');
		}), TurboFileRemoteCancellationError);
		assert.strictEqual(control.cancellation, undefined);
		await control.cancel(async command => { commands.push(command); });
		assert.strictEqual(commands.length, 2);
		assert.strictEqual(commands[0], commands[1]);
	});

	test('completion before cancellation or while waiting for a marker sends no kill command', async () => {
		let calls = 0;
		for (const completeBeforeCancel of [false, true]) {
			const control = new TurboFileRemoteProcessControl(nonce);
			if (completeBeforeCancel) { control.complete(); }
			const canceled = control.cancel(async () => { calls++; });
			control.complete();
			control.accept(marker('4321:76543'));
			await canceled;
		}
		assert.deepStrictEqual({ calls, timers: clock.countTimers() }, { calls: 0, timers: 0 });
	});

	test('concurrent cancellation callers share one confirmation command', async () => {
		const control = new TurboFileRemoteProcessControl(nonce);
		const confirmation = new DeferredPromise<void>();
		let calls = 0;
		control.accept(marker('4321:76543'));
		const first = control.cancel(async () => { calls++; await confirmation.p; });
		const second = control.cancel(async () => { calls++; });
		assert.strictEqual(first, second);
		await clock.tickAsync(0);
		assert.strictEqual(calls, 1);
		await confirmation.complete();
		await Promise.all([first, second]);
		await control.cancel(async () => { calls++; });
		assert.deepStrictEqual({ calls, timers: clock.countTimers() }, { calls: 1, timers: 0 });
	});

	test('a group kill is guarded by the recorded identity and issued only once', async () => {
		const control = new TurboFileRemoteProcessControl(nonce);
		let command = '';
		control.accept(marker('4321:76543'));
		await control.cancel(async value => { command = value; });
		assert.ok(command.includes("'/proc/4321/stat'") && command.includes("start='76543'"));
		assert.ok(command.includes('a[3]==pid && a[4]==pid'), 'Group and session must both match the SSH leader.');
		assert.ok(command.indexOf('if ! tf_group_matches') < command.indexOf('kill -KILL -4321'), 'Ownership must be checked before the kill.');
		assert.strictEqual(command.match(/kill -KILL /g)?.length, 1);
		assert.ok(!command.includes('pkill') && !command.includes('killall'));
	});
});
