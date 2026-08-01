/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { orderTurboFileDirectSshRoutes, TurboFileDirectSshRoute } from './turbofileDirectRoute.js';

export interface ITurboFilePreparedDirectRouteSnapshot {
	readonly route: TurboFileDirectSshRoute;
	readonly preparedAt: number;
	readonly generation: number;
}

interface IPreparedDecisionMetadata {
	readonly preparedAt: number;
	readonly generation: number;
}

/**
 * Stores the route decision produced while both file panes are open. Entries are scoped by the
 * caller-provided connection identity (including its credential fingerprint) and protocol, so a
 * transfer can consume the decision synchronously without doing network work on its hot path.
 */
export class TurboFilePreparedDirectRouteCache {
	private readonly directRoutes = new Map<string, IPreparedDecisionMetadata>();
	private readonly relayPairs = new Map<string, IPreparedDecisionMetadata>();
	private generation = 0;

	getRoute(sourceKey: string, targetKey: string, protocol: string, preferred?: TurboFileDirectSshRoute): TurboFileDirectSshRoute | undefined {
		return this.getRouteSnapshot(sourceKey, targetKey, protocol, preferred)?.route;
	}

	getRouteSnapshot(sourceKey: string, targetKey: string, protocol: string, preferred?: TurboFileDirectSshRoute): ITurboFilePreparedDirectRouteSnapshot | undefined {
		for (const route of orderTurboFileDirectSshRoutes(preferred)) {
			const metadata = this.directRoutes.get(this.routeKey(sourceKey, targetKey, protocol, route));
			if (metadata) {
				return { route, ...metadata };
			}
		}
		return undefined;
	}

	isRelay(sourceKey: string, targetKey: string, protocol: string): boolean {
		return this.relayPairs.has(this.pairKey(sourceKey, targetKey, protocol));
	}

	needsRefresh(sourceKey: string, targetKey: string, protocol: string, maxAgeMs: number, now = Date.now()): boolean {
		const preparedAt = this.getPreparedAt(sourceKey, targetKey, protocol);
		return preparedAt === undefined || now - preparedAt >= Math.max(0, maxAgeMs);
	}

	rememberRoute(sourceKey: string, targetKey: string, protocol: string, route: TurboFileDirectSshRoute, preparedAt = Date.now()): void {
		const reverseRoute = invertDirectSshRoute(route);
		const metadata = { preparedAt, generation: ++this.generation };
		this.clearDirectRoutes(sourceKey, targetKey, protocol);
		this.relayPairs.delete(this.pairKey(sourceKey, targetKey, protocol));
		this.relayPairs.delete(this.pairKey(targetKey, sourceKey, protocol));
		this.directRoutes.set(this.routeKey(sourceKey, targetKey, protocol, route), metadata);
		this.directRoutes.set(this.routeKey(targetKey, sourceKey, protocol, reverseRoute), metadata);
	}

	rememberRelay(sourceKey: string, targetKey: string, protocol: string, preparedAt = Date.now()): void {
		const metadata = { preparedAt, generation: ++this.generation };
		this.clearDirectRoutes(sourceKey, targetKey, protocol);
		this.relayPairs.set(this.pairKey(sourceKey, targetKey, protocol), metadata);
		this.relayPairs.set(this.pairKey(targetKey, sourceKey, protocol), metadata);
	}

	forgetRoute(sourceKey: string, targetKey: string, protocol: string, route: TurboFileDirectSshRoute, generation?: number): void {
		if (generation !== undefined && this.directRoutes.get(this.routeKey(sourceKey, targetKey, protocol, route))?.generation !== generation) {
			return;
		}
		this.directRoutes.delete(this.routeKey(sourceKey, targetKey, protocol, route));
		this.directRoutes.delete(this.routeKey(targetKey, sourceKey, protocol, invertDirectSshRoute(route)));
	}

	private clearDirectRoutes(sourceKey: string, targetKey: string, protocol: string): void {
		for (const route of orderTurboFileDirectSshRoutes()) {
			this.directRoutes.delete(this.routeKey(sourceKey, targetKey, protocol, route));
			this.directRoutes.delete(this.routeKey(targetKey, sourceKey, protocol, route));
		}
	}

	private getPreparedAt(sourceKey: string, targetKey: string, protocol: string): number | undefined {
		const pairKey = this.pairKey(sourceKey, targetKey, protocol);
		const relay = this.relayPairs.get(pairKey);
		if (relay) {
			return relay.preparedAt;
		}
		for (const route of orderTurboFileDirectSshRoutes()) {
			const metadata = this.directRoutes.get(this.routeKey(sourceKey, targetKey, protocol, route));
			if (metadata) {
				return metadata.preparedAt;
			}
		}
		return undefined;
	}

	private pairKey(sourceKey: string, targetKey: string, protocol: string): string {
		return `${sourceKey}=>${targetKey}:${protocol}`;
	}

	private routeKey(sourceKey: string, targetKey: string, protocol: string, route: TurboFileDirectSshRoute): string {
		return `${this.pairKey(sourceKey, targetKey, protocol)}:${route}`;
	}
}

function invertDirectSshRoute(route: TurboFileDirectSshRoute): TurboFileDirectSshRoute {
	return route === 'source-push' ? 'target-pull' : 'source-push';
}
