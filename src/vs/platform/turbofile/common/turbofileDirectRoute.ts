/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type TurboFileDirectSshRoute = 'source-push' | 'target-pull';
export type TurboFileDirectVerification = 'available' | 'unavailable' | 'indeterminate';
export type TurboFileDirectRouteStage = 'initial' | 'retry';

export interface ITurboFileDirectRouteFailure {
	readonly route: TurboFileDirectSshRoute;
	readonly stage: TurboFileDirectRouteStage;
}

export class TurboFileDirectUnavailableError extends Error {
	readonly route: TurboFileDirectSshRoute | undefined;
	readonly stage: TurboFileDirectRouteStage | undefined;
	readonly failures: readonly ITurboFileDirectRouteFailure[];

	constructor(failures: readonly ITurboFileDirectRouteFailure[]) {
		super('No direct SSH route is available.');
		this.name = 'TurboFileDirectUnavailableError';
		this.failures = [...failures];
		const latestFailure = this.failures[this.failures.length - 1];
		this.route = latestFailure?.route;
		this.stage = latestFailure?.stage;
	}
}

export class TurboFileDirectDataError extends Error {
	readonly route: TurboFileDirectSshRoute;
	readonly stage = 'retry' as const;
	readonly failures: readonly ITurboFileDirectRouteFailure[];
	readonly transferCause!: unknown;

	constructor(route: TurboFileDirectSshRoute, failures: readonly ITurboFileDirectRouteFailure[], transferCause?: unknown) {
		super('The direct SSH transfer failed after verification.');
		this.name = 'TurboFileDirectDataError';
		this.route = route;
		this.failures = [...failures];
		Object.defineProperty(this, 'transferCause', {
			value: transferCause,
			enumerable: false,
			configurable: false,
			writable: false
		});
	}
}

export interface ITurboFileDirectRouteFlowOptions<T> {
	readonly routes: readonly TurboFileDirectSshRoute[];
	readonly run: (route: TurboFileDirectSshRoute, retry: boolean) => Promise<T>;
	readonly verify: (route: TurboFileDirectSshRoute, failure: unknown) => Promise<TurboFileDirectVerification>;
	readonly isCancellationError: (error: unknown) => boolean;
}

export interface ITurboFileDirectRouteFlowResult<T> {
	readonly route: TurboFileDirectSshRoute;
	readonly value: T;
}

export function orderTurboFileDirectSshRoutes(preferred?: TurboFileDirectSshRoute): readonly TurboFileDirectSshRoute[] {
	const routes: readonly TurboFileDirectSshRoute[] = ['source-push', 'target-pull'];
	return preferred ? [preferred, ...routes.filter(route => route !== preferred)] : routes;
}

export function classifyTurboFileDirectSshVerification(markerMatched: boolean, nestedCommandExited: boolean): TurboFileDirectVerification {
	if (markerMatched) {
		return 'available';
	}
	return nestedCommandExited ? 'unavailable' : 'indeterminate';
}

export async function runTurboFileDirectRouteFlow<T>(options: ITurboFileDirectRouteFlowOptions<T>): Promise<ITurboFileDirectRouteFlowResult<T>> {
	const failures: ITurboFileDirectRouteFailure[] = [];
	for (const route of options.routes) {
		let failure: unknown;
		try {
			return { route, value: await options.run(route, false) };
		} catch (error) {
			if (options.isCancellationError(error)) {
				throw error;
			}
			failure = error;
			failures.push({ route, stage: 'initial' });
		}

		let verification: TurboFileDirectVerification = 'indeterminate';
		try {
			verification = await options.verify(route, failure);
		} catch (error) {
			if (options.isCancellationError(error)) {
				throw error;
			}
		}
		if (verification === 'unavailable') {
			continue;
		}

		try {
			return { route, value: await options.run(route, true) };
		} catch (error) {
			if (options.isCancellationError(error)) {
				throw error;
			}
			failures.push({ route, stage: 'retry' });
			throw new TurboFileDirectDataError(route, failures, error);
		}
	}

	throw new TurboFileDirectUnavailableError(failures);
}
