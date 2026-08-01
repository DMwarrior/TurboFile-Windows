/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../base/common/errors.js';
import { IDisposable } from '../../../base/common/lifecycle.js';
import { TurboFileDirectSshRoute, TurboFileDirectVerification } from './turbofileDirectRoute.js';
import { withTurboFileTimeout } from './turbofileTimeout.js';

export const TURBO_FILE_DIRECT_ROUTE_PROBE_DEADLINE_MS = 800;
export const TURBO_FILE_DIRECT_ROUTE_PROBE_DECISION_BUDGET_MS = 100;

export type TurboFileDirectRouteProbeDecision =
	| { readonly kind: 'direct'; readonly route: TurboFileDirectSshRoute }
	| { readonly kind: 'relay' };

export interface ITurboFileDirectRouteProbeOptions {
	readonly probe: (route: TurboFileDirectSshRoute, token: CancellationToken) => Promise<TurboFileDirectVerification>;
	readonly token?: CancellationToken;
	readonly deadlineMs?: number;
}

/**
 * Waits only for the foreground decision window and leaves a shared background probe running.
 */
export async function waitForTurboFileDirectRouteProbe(
	pending: Promise<void>,
	getAvailableRoute: () => TurboFileDirectSshRoute | undefined,
	deadlineMs = TURBO_FILE_DIRECT_ROUTE_PROBE_DECISION_BUDGET_MS
): Promise<TurboFileDirectRouteProbeDecision> {
	const boundedDeadlineMs = Number.isFinite(deadlineMs) ? Math.max(0, deadlineMs) : TURBO_FILE_DIRECT_ROUTE_PROBE_DEADLINE_MS;
	if (boundedDeadlineMs > 0) {
		await withTurboFileTimeout(pending, boundedDeadlineMs, 'Direct route decision timed out.').catch(() => undefined);
	}
	const route = getAvailableRoute();
	return route ? { kind: 'direct', route } : { kind: 'relay' };
}

/**
 * Probes both physical direct SSH directions concurrently within one bounded decision window.
 */
export function coordinateTurboFileDirectRouteProbe(options: ITurboFileDirectRouteProbeOptions): Promise<TurboFileDirectRouteProbeDecision> {
	const cancellationToken = options.token ?? CancellationToken.None;
	if (cancellationToken.isCancellationRequested) {
		return Promise.reject(new CancellationError());
	}

	const routes: readonly TurboFileDirectSshRoute[] = ['source-push', 'target-pull'];
	const deadlineMs = Number.isFinite(options.deadlineMs) ? Math.max(0, options.deadlineMs ?? 0) : TURBO_FILE_DIRECT_ROUTE_PROBE_DEADLINE_MS;
	const sources = new Map<TurboFileDirectSshRoute, CancellationTokenSource>();
	const activeRoutes = new Set<TurboFileDirectSshRoute>();
	for (const route of routes) {
		sources.set(route, new CancellationTokenSource());
		activeRoutes.add(route);
	}

	return new Promise<TurboFileDirectRouteProbeDecision>((resolve, reject) => {
		let settled = false;
		let cancellationListener: IDisposable | undefined;
		let deadline: ReturnType<typeof setTimeout> | undefined;

		const disposeSources = (): void => {
			for (const source of sources.values()) {
				source.dispose();
			}
		};
		const cancelActiveRoutes = (): void => {
			for (const route of activeRoutes) {
				sources.get(route)?.cancel();
			}
			activeRoutes.clear();
		};
		const finish = (callback: () => void, cancelActive: boolean): void => {
			if (settled) {
				return;
			}
			settled = true;
			if (deadline) {
				clearTimeout(deadline);
			}
			cancellationListener?.dispose();
			if (cancelActive) {
				cancelActiveRoutes();
			}
			disposeSources();
			callback();
		};
		const finishRelay = (cancelActive: boolean): void => {
			finish(() => resolve({ kind: 'relay' }), cancelActive);
		};
		const finishCancellation = (error: unknown): void => {
			finish(() => reject(error), true);
		};

		cancellationListener = cancellationToken.onCancellationRequested(() => finishCancellation(new CancellationError()));
		deadline = setTimeout(() => finishRelay(true), deadlineMs);

		const handleResult = (route: TurboFileDirectSshRoute, verification: TurboFileDirectVerification): void => {
			if (settled) {
				return;
			}
			activeRoutes.delete(route);
			if (verification === 'available') {
				finish(() => resolve({ kind: 'direct', route }), true);
				return;
			}
			if (activeRoutes.size === 0) {
				finishRelay(false);
			}
		};
		const handleError = (route: TurboFileDirectSshRoute, error: unknown): void => {
			if (settled) {
				return;
			}
			activeRoutes.delete(route);
			if (isCancellationError(error)) {
				finishCancellation(error);
				return;
			}
			if (activeRoutes.size === 0) {
				finishRelay(false);
			}
		};

		for (const route of routes) {
			if (settled) {
				break;
			}
			let probe: Promise<TurboFileDirectVerification>;
			try {
				probe = Promise.resolve(options.probe(route, sources.get(route)!.token));
			} catch (error) {
				probe = Promise.reject(error);
			}
			probe.then(
				verification => handleResult(route, verification),
				error => handleError(route, error)
			);
		}
	});
}
