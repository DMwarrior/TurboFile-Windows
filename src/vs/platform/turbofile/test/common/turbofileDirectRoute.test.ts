/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import * as directRoute from '../../common/turbofileDirectRoute.js';
import { orderTurboFileDirectSshRoutes, runTurboFileDirectRouteFlow, TurboFileDirectDataError, TurboFileDirectUnavailableError } from '../../common/turbofileDirectRoute.js';

suite('TurboFileDirectRoute', () => {

	test('reports the stage that actually failed while retaining diagnostics outside serialized route metadata', () => {
		const cause = new Error('sensitive remote command diagnostic');
		const error = new TurboFileDirectDataError('source-push', [{ route: 'source-push', stage: 'initial' }], cause);
		const unavailable = new TurboFileDirectUnavailableError([{ route: 'source-push', stage: 'initial' }], cause);
		assert.deepStrictEqual({
			stage: error.stage,
			message: error.message,
			causeRetained: error.transferCause === cause && unavailable.transferCause === cause,
			serializedCause: JSON.stringify([error, unavailable]).includes(cause.message)
		}, {
			stage: 'initial',
			message: 'The direct SSH transfer failed.',
			causeRetained: true,
			serializedCause: false
		});
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('orders source push before target pull by default', () => {
		assert.deepStrictEqual(orderTurboFileDirectSshRoutes(), ['source-push', 'target-pull']);
	});

	test('moves the most recently successful target pull first without removing source push', () => {
		assert.deepStrictEqual(orderTurboFileDirectSshRoutes('target-pull'), ['target-pull', 'source-push']);
	});

	test('classifies only a typed nested command exit as unavailable', () => {
		const classify = Reflect.get(directRoute, 'classifyTurboFileDirectSshVerification') as ((markerMatched: boolean, nestedCommandExited: boolean) => string) | undefined;
		assert.ok(classify);
		assert.deepStrictEqual([
			classify(true, false),
			classify(false, true),
			classify(false, false)
		], ['available', 'unavailable', 'indeterminate']);
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
		assert.strictEqual(Reflect.get(result, 'stage'), 'initial');
		assert.strictEqual(Object.prototype.hasOwnProperty.call(result, 'cause'), false);
		assert.ok(!Object.values(result).includes(firstFailure));
		assert.ok(!Object.values(result).includes(secondFailure));
		assert.deepStrictEqual(result.failures, [
			{ route: 'source-push', stage: 'initial' },
			{ route: 'target-pull', stage: 'initial' }
		]);
		assert.ok(result.failures.every(failure => !Object.prototype.hasOwnProperty.call(failure, 'failure')));
		assert.ok(!result.message.includes(firstFailure.message));
		assert.ok(!result.message.includes(secondFailure.message));
		assert.ok(!JSON.stringify(result).includes(firstFailure.message));
		assert.ok(!JSON.stringify(result).includes(secondFailure.message));
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
		assert.strictEqual(Reflect.get(result, 'stage'), 'retry');
		assert.strictEqual(Object.prototype.hasOwnProperty.call(result, 'cause'), false);
		assert.ok(!Object.values(result).includes(firstFailure));
		assert.ok(!Object.values(result).includes(retryFailure));
		assert.deepStrictEqual(result.failures, [
			{ route: 'source-push', stage: 'initial' },
			{ route: 'source-push', stage: 'retry' }
		]);
		assert.ok(result.failures.every(failure => !Object.prototype.hasOwnProperty.call(failure, 'failure')));
		assert.ok(!result.message.includes(firstFailure.message));
		assert.ok(!result.message.includes(retryFailure.message));
		assert.ok(!JSON.stringify(result).includes(firstFailure.message));
		assert.ok(!JSON.stringify(result).includes(retryFailure.message));
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
