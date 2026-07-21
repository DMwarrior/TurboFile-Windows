/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ITurboFileBatchTransferFlowOptions, runTurboFileBatchTransferFlow, runTurboFileConcurrentBatchAttempt } from '../../common/turbofileBatchTransferFlow.js';
import { TurboFileDirectDataError, TurboFileDirectUnavailableError } from '../../common/turbofileDirectRoute.js';
import type { ITurboFileBatchTransferFailure, ITurboFileBatchTransferResult, ITurboFileTransferAttempt } from '../../common/turbofile.js';

suite('TurboFileBatchTransferFlow', () => {
	const attempts: readonly ITurboFileTransferAttempt[] = [
		{ protocol: 'tar', route: 'direct', reason: 'direct' },
		{ protocol: 'tar', route: 'relay', reason: 'relay' },
		{ protocol: 'scp', route: 'relay', reason: 'concurrent' }
	];

	const result = (ok: boolean, strategy: ITurboFileBatchTransferResult['strategy'], completed: number): ITurboFileBatchTransferResult => ({
		ok,
		strategy,
		bytes: 10,
		message: ok ? 'complete' : 'failed',
		completed,
		failed: ok ? 0 : 1,
		failures: ok ? [] : [{ name: 'item', path: '/item', message: 'failed' }]
	});

	const cleanupFailure: ITurboFileBatchTransferFailure = { name: 'item', path: '/item', message: 'cleanup failed' };

	function options(overrides: Partial<ITurboFileBatchTransferFlowOptions>): ITurboFileBatchTransferFlowOptions {
		return {
			attempts,
			operation: 'move',
			totalItems: 1,
			runAttempt: async attempt => result(true, attempt.route === 'direct' ? 'tar-direct' : 'tar-relay', 1),
			cleanupSources: async () => [],
			createCleanupFailureResult: (successfulResult, failures) => ({
				...successfulResult,
				ok: false,
				message: 'Batch transfer completed, but source cleanup failed.',
				failed: failures.length,
				failures: [...failures]
			}),
			onIncompleteResult: () => { },
			onAttemptError: () => { },
			...overrides
		};
	}

	test('makes cleanup failure terminal without running another attempt', async () => {
		const calls: string[] = [];
		const actual = await runTurboFileBatchTransferFlow(options({
			runAttempt: async attempt => {
				calls.push(`attempt:${attempt.route}`);
				return result(true, 'tar-direct', 1);
			},
			cleanupSources: async () => {
				calls.push('cleanup');
				return [cleanupFailure];
			}
		}));

		assert.deepStrictEqual({ actual, calls }, {
			actual: {
				...result(true, 'tar-direct', 1),
				ok: false,
				message: 'Batch transfer completed, but source cleanup failed.',
				failed: 1,
				failures: [cleanupFailure]
			},
			calls: ['attempt:direct', 'cleanup']
		});
	});

	for (const directFailure of [
		new TurboFileDirectDataError('source-push', []),
		new TurboFileDirectUnavailableError([])
	]) {
		test(`continues to relay after ${directFailure.name}`, async () => {
			const calls: string[] = [];
			const actual = await runTurboFileBatchTransferFlow(options({
				operation: 'copy',
				runAttempt: async (attempt, index) => {
					calls.push(`attempt:${attempt.route}`);
					if (index === 0) {
						throw directFailure;
					}
					return result(true, 'tar-relay', 1);
				},
				onAttemptError: (error, attempt) => calls.push(`error:${attempt.route}:${error.name}`)
			}));

			assert.deepStrictEqual({ strategy: actual?.strategy, calls }, {
				strategy: 'tar-relay',
				calls: ['attempt:direct', `error:direct:${directFailure.name}`, 'attempt:relay']
			});
		});
	}

	for (const [name, successfulIndex, strategy] of [
		['direct', 0, 'tar-direct'],
		['relay', 1, 'tar-relay'],
		['concurrent', 2, 'scp-relay']
	] as const) {
		test(`cleans sources once after a successful ${name} move`, async () => {
			const calls: string[] = [];
			const actual = await runTurboFileBatchTransferFlow(options({
				runAttempt: async (attempt, index) => {
					calls.push(`attempt:${index}`);
					return index === successfulIndex ? result(true, strategy, 1) : result(false, 'tar-direct', 0);
				},
				cleanupSources: async () => {
					calls.push('cleanup');
					return [];
				}
			}));

			assert.deepStrictEqual({ strategy: actual?.strategy, calls }, {
				strategy,
				calls: [...attempts.slice(0, successfulIndex + 1).map((_attempt, index) => `attempt:${index}`), 'cleanup']
			});
		});
	}

	test('never cleans sources for copy', async () => {
		let cleanupCalls = 0;
		const actual = await runTurboFileBatchTransferFlow(options({
			operation: 'copy',
			cleanupSources: async () => {
				cleanupCalls++;
				return [];
			}
		}));

		assert.deepStrictEqual({ ok: actual?.ok, cleanupCalls }, { ok: true, cleanupCalls: 0 });
	});

	test('defers typed direct batch errors until every concurrent worker settles', async () => {
		const events: string[] = [];
		const unavailableError = new TurboFileDirectUnavailableError([]);
		const dataError = new TurboFileDirectDataError('target-pull', []);
		let releaseSecondWorker!: () => void;
		const firstWorkerCaptured = new Promise<void>(resolve => releaseSecondWorker = resolve);

		await assert.rejects(runTurboFileConcurrentBatchAttempt({
			fallbackStrategy: 'scp-direct',
			run: async controller => {
				await Promise.all([
					(async () => {
						assert.strictEqual(controller.captureDirectError(unavailableError), true);
						events.push('unavailable-captured');
						releaseSecondWorker();
					})(),
					(async () => {
						await firstWorkerCaptured;
						assert.strictEqual(controller.captureDirectError(dataError), true);
						events.push('data-failure-captured');
					})()
				]);
				events.push('workers-settled');
			}
		}), error => {
			events.push('error-thrown');
			return error === dataError;
		});

		assert.deepStrictEqual(events, [
			'unavailable-captured',
			'data-failure-captured',
			'workers-settled',
			'error-thrown'
		]);
	});

	for (const [failedStrategy, successfulStrategy] of [
		['scp-direct', 'scp-relay'],
		['sftp-direct', 'sftp-relay']
	] as const) {
		test(`ignores a failed ${failedStrategy} result before a successful ${successfulStrategy} result`, async () => {
			const actual = await runTurboFileConcurrentBatchAttempt({
				fallbackStrategy: 'scp-direct',
				run: async controller => {
					controller.recordResult({ ok: false, strategy: failedStrategy, bytes: 0, message: 'failed' });
					controller.recordResult({ ok: true, strategy: successfulStrategy, bytes: 10, message: 'complete' });
				}
			});

			assert.strictEqual(actual, successfulStrategy);
		});
	}
});
