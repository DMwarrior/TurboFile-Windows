/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type TurboFileDirectSshRoute = 'source-push' | 'target-pull';
export type TurboFileDirectVerification = 'available' | 'unavailable' | 'indeterminate';

export interface ITurboFileDirectRouteFailure {
	readonly route: TurboFileDirectSshRoute;
	readonly failure: unknown;
}

export class TurboFileDirectUnavailableError extends Error {
	readonly route: TurboFileDirectSshRoute | undefined;
	override readonly cause: unknown;
	readonly failures: readonly ITurboFileDirectRouteFailure[];

	constructor(failures: readonly ITurboFileDirectRouteFailure[]) {
		super('No direct SSH route is available.');
		this.name = 'TurboFileDirectUnavailableError';
		this.failures = [...failures];
		const latestFailure = this.failures[this.failures.length - 1];
		this.route = latestFailure?.route;
		this.cause = latestFailure?.failure;
	}
}

export class TurboFileDirectDataError extends Error {
	readonly route: TurboFileDirectSshRoute;
	override readonly cause: unknown;
	readonly failures: readonly ITurboFileDirectRouteFailure[];

	constructor(route: TurboFileDirectSshRoute, cause: unknown, failures: readonly ITurboFileDirectRouteFailure[]) {
		super('The direct SSH transfer failed after verification.');
		this.name = 'TurboFileDirectDataError';
		this.route = route;
		this.cause = cause;
		this.failures = [...failures];
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
			failures.push({ route, failure });
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
			failures.push({ route, failure: error });
			throw new TurboFileDirectDataError(route, error, failures);
		}
	}

	throw new TurboFileDirectUnavailableError(failures);
}
