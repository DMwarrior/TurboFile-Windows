/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../base/common/errors.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TurboFileDirectSshRoute, TurboFileDirectVerification } from '../../common/turbofileDirectRoute.js';
import { coordinateTurboFileDirectRouteProbe, TURBO_FILE_DIRECT_ROUTE_PROBE_DEADLINE_MS, TURBO_FILE_DIRECT_ROUTE_PROBE_DECISION_BUDGET_MS, waitForTurboFileDirectRouteProbe } from '../../common/turbofileDirectRouteProbe.js';

suite('TurboFileDirectRouteProbe', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('starts both directions concurrently and returns the first available route', async () => {
		const disposables = new DisposableStore();
		const probes = new Map<TurboFileDirectSshRoute, DeferredPromise<TurboFileDirectVerification>>();
		const cancelled: TurboFileDirectSshRoute[] = [];
		try {
			const decision = coordinateTurboFileDirectRouteProbe({
				probe: (route, token) => {
					const probe = new DeferredPromise<TurboFileDirectVerification>();
					probes.set(route, probe);
					disposables.add(token.onCancellationRequested(() => cancelled.push(route)));
					return probe.p;
				}
			});

			assert.deepStrictEqual([...probes.keys()], ['source-push', 'target-pull']);
			probes.get('target-pull')?.complete('available');

			assert.deepStrictEqual(await decision, { kind: 'direct', route: 'target-pull' });
			assert.deepStrictEqual(cancelled, ['source-push']);
		} finally {
			disposables.dispose();
		}
	});

	test('returns relay as soon as both directions explicitly report unavailable', async () => {
		const probes = new Map<TurboFileDirectSshRoute, DeferredPromise<TurboFileDirectVerification>>();
		let settled = false;
		const decision = coordinateTurboFileDirectRouteProbe({
			probe: route => {
				const probe = new DeferredPromise<TurboFileDirectVerification>();
				probes.set(route, probe);
				return probe.p;
			},
			deadlineMs: 1000
		});
		decision.finally(() => settled = true);

		probes.get('source-push')?.complete('unavailable');
		await Promise.resolve();
		assert.strictEqual(settled, false);
		probes.get('target-pull')?.complete('unavailable');

		assert.deepStrictEqual(await decision, { kind: 'relay' });
	});

	test('keeps waiting for the other direction after an indeterminate result', async () => {
		const probes = new Map<TurboFileDirectSshRoute, DeferredPromise<TurboFileDirectVerification>>();
		let settled = false;
		const decision = coordinateTurboFileDirectRouteProbe({
			probe: route => {
				const probe = new DeferredPromise<TurboFileDirectVerification>();
				probes.set(route, probe);
				return probe.p;
			},
			deadlineMs: 1000
		});
		decision.finally(() => settled = true);

		probes.get('source-push')?.complete('indeterminate');
		await Promise.resolve();
		assert.strictEqual(settled, false);
		probes.get('target-pull')?.complete('available');

		assert.deepStrictEqual(await decision, { kind: 'direct', route: 'target-pull' });
	});

	test('returns relay once both directions settle without an available result', async () => {
		const clock = sinon.useFakeTimers();
		try {
			const decisions = [
				coordinateTurboFileDirectRouteProbe({
					probe: async route => route === 'source-push' ? 'unavailable' : 'indeterminate',
					deadlineMs: 1000
				}),
				coordinateTurboFileDirectRouteProbe({
					probe: async route => {
						if (route === 'source-push') {
							throw new Error('probe transport failed');
						}
						return 'indeterminate';
					},
					deadlineMs: 1000
				})
			];
			const results: unknown[] = [];
			for (const decision of decisions) {
				decision.then(result => results.push(result));
			}
			await clock.tickAsync(0);

			assert.deepStrictEqual(results, [{ kind: 'relay' }, { kind: 'relay' }]);
		} finally {
			clock.restore();
		}
	});

	test('uses an 800ms default hard deadline and cancels both hanging probes on timeout', async () => {
		const clock = sinon.useFakeTimers();
		const disposables = new DisposableStore();
		const cancelled: TurboFileDirectSshRoute[] = [];
		try {
			let settled = false;
			const decision = coordinateTurboFileDirectRouteProbe({
				probe: (route, token) => {
					disposables.add(token.onCancellationRequested(() => cancelled.push(route)));
					return new Promise<TurboFileDirectVerification>(() => undefined);
				}
			});
			decision.finally(() => settled = true);

			await clock.tickAsync(TURBO_FILE_DIRECT_ROUTE_PROBE_DEADLINE_MS - 1);
			assert.strictEqual(settled, false);
			await clock.tickAsync(1);

			assert.deepStrictEqual({ result: await decision, cancelled }, {
				result: { kind: 'relay' },
				cancelled: ['source-push', 'target-pull']
			});
		} finally {
			disposables.dispose();
			clock.restore();
		}
	});

	test('rethrows user cancellation and cancels both probes instead of selecting relay', async () => {
		const source = new CancellationTokenSource();
		const disposables = new DisposableStore();
		const cancelled: TurboFileDirectSshRoute[] = [];
		try {
			const decision = coordinateTurboFileDirectRouteProbe({
				probe: (route, token) => {
					disposables.add(token.onCancellationRequested(() => cancelled.push(route)));
					return new Promise<TurboFileDirectVerification>(() => undefined);
				},
				token: source.token,
				deadlineMs: 1000
			});

			source.cancel();
			await assert.rejects(decision, isCancellationError);
			assert.deepStrictEqual(cancelled, ['source-push', 'target-pull']);
		} finally {
			disposables.dispose();
			source.dispose();
		}
	});

	test('does not start probes when user cancellation was already requested', async () => {
		let calls = 0;
		await assert.rejects(coordinateTurboFileDirectRouteProbe({
			probe: async () => {
				calls++;
				return 'available';
			},
			token: CancellationToken.Cancelled
		}), isCancellationError);
		assert.strictEqual(calls, 0);
	});

	test('rethrows cancellation raised by a probe and cancels its peer', async () => {
		const disposables = new DisposableStore();
		const peerCancelled = new DeferredPromise<void>();
		const cancellation = new CancellationError();
		try {
			await assert.rejects(coordinateTurboFileDirectRouteProbe({
				probe: async (route, token) => {
					if (route === 'source-push') {
						await timeout(0);
						throw cancellation;
					}
					disposables.add(token.onCancellationRequested(() => peerCancelled.complete()));
					return new Promise<TurboFileDirectVerification>(() => undefined);
				},
				deadlineMs: 1000
			}), error => error === cancellation);
			await peerCancelled.p;
		} finally {
			disposables.dispose();
		}
	});

	test('does not retain a negative decision between calls', async () => {
		let round = 0;
		const probe = async (route: TurboFileDirectSshRoute): Promise<TurboFileDirectVerification> => {
			if (round === 0) {
				return 'unavailable';
			}
			return route === 'source-push' ? 'available' : 'unavailable';
		};

		const first = await coordinateTurboFileDirectRouteProbe({ probe });
		round++;
		const second = await coordinateTurboFileDirectRouteProbe({ probe });

		assert.deepStrictEqual([first, second], [
			{ kind: 'relay' },
			{ kind: 'direct', route: 'source-push' }
		]);
	});

	test('uses a proof completed before the bounded foreground decision for the current transfer', async () => {
		const clock = sinon.useFakeTimers();
		const pending = new DeferredPromise<void>();
		let availableRoute: TurboFileDirectSshRoute | undefined;
		try {
			const decision = waitForTurboFileDirectRouteProbe(
				pending.p.then(() => undefined),
				() => availableRoute
			);

			await clock.tickAsync(TURBO_FILE_DIRECT_ROUTE_PROBE_DECISION_BUDGET_MS - 1);
			availableRoute = 'source-push';
			pending.complete();
			await clock.tickAsync(0);

			assert.deepStrictEqual(await decision, { kind: 'direct', route: 'source-push' });
		} finally {
			clock.restore();
		}
	});

	test('selects relay within 800ms without cancelling a late positive background probe', async () => {
		const clock = sinon.useFakeTimers();
		const pending = new DeferredPromise<void>();
		let availableRoute: TurboFileDirectSshRoute | undefined;
		try {
			const firstDecision = waitForTurboFileDirectRouteProbe(
				pending.p.then(() => undefined),
				() => availableRoute
			);

			assert.ok(TURBO_FILE_DIRECT_ROUTE_PROBE_DECISION_BUDGET_MS <= 700);
			assert.ok(TURBO_FILE_DIRECT_ROUTE_PROBE_DECISION_BUDGET_MS < TURBO_FILE_DIRECT_ROUTE_PROBE_DEADLINE_MS);
			await clock.tickAsync(TURBO_FILE_DIRECT_ROUTE_PROBE_DECISION_BUDGET_MS);
			assert.deepStrictEqual(await firstDecision, { kind: 'relay' });
			assert.strictEqual(pending.isSettled, false);

			availableRoute = 'target-pull';
			pending.complete();
			await clock.tickAsync(0);
			assert.deepStrictEqual(await waitForTurboFileDirectRouteProbe(pending.p.then(() => undefined), () => availableRoute), {
				kind: 'direct',
				route: 'target-pull'
			});
		} finally {
			clock.restore();
		}
	});
});
