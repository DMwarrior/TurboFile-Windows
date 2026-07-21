/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { orderTurboFileDirectSshRoutes, runTurboFileDirectRouteFlow, TurboFileDirectDataError, TurboFileDirectUnavailableError } from '../../common/turbofileDirectRoute.js';

suite('TurboFileDirectRoute', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('orders source push before target pull by default', () => {
		assert.deepStrictEqual(orderTurboFileDirectSshRoutes(), ['source-push', 'target-pull']);
	});

	test('moves the most recently successful target pull first without removing source push', () => {
		assert.deepStrictEqual(orderTurboFileDirectSshRoutes('target-pull'), ['target-pull', 'source-push']);
	});

	test('returns the first successful route without verification', async () => {
		const calls: string[] = [];
		const result = await runTurboFileDirectRouteFlow({
			routes: ['source-push', 'target-pull'],
			run: async (route, retry) => {
				calls.push(`run:${route}:${retry}`);
				return 'transferred';
			},
			verify: async () => {
				calls.push('verify');
				return 'available';
			},
			isCancellationError: () => false
		});

		assert.deepStrictEqual(result, { route: 'source-push', value: 'transferred' });
		assert.deepStrictEqual(calls, ['run:source-push:false']);
	});

	test('retries the same route once when verification reports available', async () => {
		const calls: string[] = [];
		let attempts = 0;
		const result = await runTurboFileDirectRouteFlow({
			routes: ['source-push', 'target-pull'],
			run: async (route, retry) => {
				calls.push(`run:${route}:${retry}`);
				if (attempts++ === 0) {
					throw new Error('initial transfer failure');
				}
				return 'transferred';
			},
			verify: async route => {
				calls.push(`verify:${route}`);
				return 'available';
			},
			isCancellationError: () => false
		});

		assert.deepStrictEqual(result, { route: 'source-push', value: 'transferred' });
		assert.deepStrictEqual(calls, ['run:source-push:false', 'verify:source-push', 'run:source-push:true']);
	});

	test('retries the same route once when verification is indeterminate', async () => {
		const calls: string[] = [];
		let attempts = 0;
		const result = await runTurboFileDirectRouteFlow({
			routes: ['source-push', 'target-pull'],
			run: async (route, retry) => {
				calls.push(`run:${route}:${retry}`);
				if (attempts++ === 0) {
					throw new Error('initial transfer failure');
				}
				return 'transferred';
			},
			verify: async route => {
				calls.push(`verify:${route}`);
				return 'indeterminate';
			},
			isCancellationError: () => false
		});

		assert.deepStrictEqual(result, { route: 'source-push', value: 'transferred' });
		assert.deepStrictEqual(calls, ['run:source-push:false', 'verify:source-push', 'run:source-push:true']);
	});

	test('treats a non-cancellation verification failure as indeterminate and retries the same route', async () => {
		const calls: string[] = [];
		let attempts = 0;
		const result = await runTurboFileDirectRouteFlow({
			routes: ['source-push', 'target-pull'],
			run: async (route, retry) => {
				calls.push(`run:${route}:${retry}`);
				if (attempts++ === 0) {
					throw new Error('initial transfer failure');
				}
				return 'transferred';
			},
			verify: async route => {
				calls.push(`verify:${route}`);
				throw new Error('verification transport failed');
			},
			isCancellationError: () => false
		});

		assert.deepStrictEqual(result, { route: 'source-push', value: 'transferred' });
		assert.deepStrictEqual(calls, ['run:source-push:false', 'verify:source-push', 'run:source-push:true']);
	});

	test('tries the next route when verification reports unavailable', async () => {
		const calls: string[] = [];
		const result = await runTurboFileDirectRouteFlow({
			routes: ['source-push', 'target-pull'],
			run: async (route, retry) => {
				calls.push(`run:${route}:${retry}`);
				if (route === 'source-push') {
					throw new Error('source cannot reach target');
				}
				return 'transferred';
			},
			verify: async route => {
				calls.push(`verify:${route}`);
				return 'unavailable';
			},
			isCancellationError: () => false
		});

		assert.deepStrictEqual(result, { route: 'target-pull', value: 'transferred' });
		assert.deepStrictEqual(calls, ['run:source-push:false', 'verify:source-push', 'run:target-pull:false']);
	});

	test('throws unavailable after every route is unavailable without exposing failure messages', async () => {
		const calls: string[] = [];
		const firstFailure = new Error('sensitive source hostname');
		const secondFailure = new Error('sensitive target hostname');
		let result: unknown;
		try {
			await runTurboFileDirectRouteFlow({
				routes: ['source-push', 'target-pull'],
				run: async (route, retry) => {
					calls.push(`run:${route}:${retry}`);
					throw route === 'source-push' ? firstFailure : secondFailure;
				},
				verify: async route => {
					calls.push(`verify:${route}`);
					return 'unavailable';
				},
				isCancellationError: () => false
			});
		} catch (error) {
			result = error;
		}
		assert.ok(result instanceof TurboFileDirectUnavailableError);
		assert.strictEqual(result.name, 'TurboFileDirectUnavailableError');
		assert.strictEqual(result.route, 'target-pull');
		assert.strictEqual(result.cause, secondFailure);
		assert.deepStrictEqual(result.failures, [
			{ route: 'source-push', failure: firstFailure },
			{ route: 'target-pull', failure: secondFailure }
		]);
		assert.ok(!result.message.includes(firstFailure.message));
		assert.ok(!result.message.includes(secondFailure.message));
		assert.deepStrictEqual(calls, ['run:source-push:false', 'verify:source-push', 'run:target-pull:false', 'verify:target-pull']);
	});

	test('throws data error after a same-route retry fails without trying another route', async () => {
		const calls: string[] = [];
		const firstFailure = new Error('sensitive initial transfer failure');
		const retryFailure = new Error('sensitive retry transfer failure');
		let result: unknown;
		try {
			await runTurboFileDirectRouteFlow({
				routes: ['source-push', 'target-pull'],
				run: async (route, retry) => {
					calls.push(`run:${route}:${retry}`);
					throw retry ? retryFailure : firstFailure;
				},
				verify: async route => {
					calls.push(`verify:${route}`);
					return 'available';
				},
				isCancellationError: () => false
			});
		} catch (error) {
			result = error;
		}
		assert.ok(result instanceof TurboFileDirectDataError);
		assert.strictEqual(result.name, 'TurboFileDirectDataError');
		assert.strictEqual(result.route, 'source-push');
		assert.strictEqual(result.cause, retryFailure);
		assert.deepStrictEqual(result.failures, [
			{ route: 'source-push', failure: firstFailure },
			{ route: 'source-push', failure: retryFailure }
		]);
		assert.ok(!result.message.includes(firstFailure.message));
		assert.ok(!result.message.includes(retryFailure.message));
		assert.deepStrictEqual(calls, ['run:source-push:false', 'verify:source-push', 'run:source-push:true']);
	});

	test('rethrows cancellation from the initial run without further calls', async () => {
		const cancellation = new Error('canceled');
		const calls: string[] = [];
		await assert.rejects(runTurboFileDirectRouteFlow({
			routes: ['source-push', 'target-pull'],
			run: async () => {
				calls.push('run');
				throw cancellation;
			},
			verify: async () => {
				calls.push('verify');
				return 'available';
			},
			isCancellationError: error => error === cancellation
		}), error => error === cancellation);
		assert.deepStrictEqual(calls, ['run']);
	});

	test('rethrows cancellation from verification without retrying', async () => {
		const cancellation = new Error('canceled');
		const calls: string[] = [];
		await assert.rejects(runTurboFileDirectRouteFlow({
			routes: ['source-push', 'target-pull'],
			run: async () => {
				calls.push('run');
				throw new Error('transfer failed');
			},
			verify: async () => {
				calls.push('verify');
				throw cancellation;
			},
			isCancellationError: error => error === cancellation
		}), error => error === cancellation);
		assert.deepStrictEqual(calls, ['run', 'verify']);
	});

	test('rethrows cancellation from a retry without trying another route', async () => {
		const cancellation = new Error('canceled');
		const calls: string[] = [];
		await assert.rejects(runTurboFileDirectRouteFlow({
			routes: ['source-push', 'target-pull'],
			run: async (_route, retry) => {
				calls.push(`run:${retry}`);
				if (retry) {
					throw cancellation;
				}
				throw new Error('transfer failed');
			},
			verify: async () => {
				calls.push('verify');
				return 'available';
			},
			isCancellationError: error => error === cancellation
		}), error => error === cancellation);
		assert.deepStrictEqual(calls, ['run:false', 'verify', 'run:true']);
	});
});
