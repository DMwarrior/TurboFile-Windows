/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type TurboFilePaneSide = 'left' | 'right';

export interface TurboFileOptimisticTransferMutation<T> {
	readonly sourceKey: string;
	readonly targetKey: string;
	readonly targetItem: T;
}

export interface TurboFileOptimisticTransferResult<T> {
	readonly sourceItems: readonly T[];
	readonly targetItems: readonly T[];
}

export interface TurboFileOptimisticTransferPathKeys {
	readonly source: (path: string) => string;
	readonly target: (path: string) => string;
}

export interface TurboFileTransferProgressSemanticState {
	readonly phase: string;
	readonly state?: string;
	readonly protocol?: string;
	readonly strategy?: string;
	readonly route?: string;
	readonly directFallbackReason?: string;
	readonly currentName?: string;
	readonly completedItems?: number;
	readonly totalItems?: number;
}

export function createTurboFileTransferProgressSemanticKey(state: TurboFileTransferProgressSemanticState): string {
	return JSON.stringify([
		state.phase,
		state.state,
		state.protocol,
		state.strategy,
		state.route,
		state.directFallbackReason,
		state.currentName,
		state.completedItems,
		state.totalItems
	]);
}

export function applyTurboFileOptimisticTransfer<T extends { readonly path?: string }>(
	operation: 'copy' | 'move',
	sourceItems: readonly T[],
	targetItems: readonly T[],
	mutations: readonly TurboFileOptimisticTransferMutation<T>[],
	samePane: boolean,
	pathKeys: TurboFileOptimisticTransferPathKeys = { source: path => path, target: path => path }
): TurboFileOptimisticTransferResult<T> {
	if (!mutations.length) {
		return { sourceItems, targetItems };
	}

	const sourceKeys = new Set(mutations.map(mutation => mutation.sourceKey));
	const targetItemsByKey = new Map(mutations.map(mutation => [mutation.targetKey, mutation.targetItem]));
	const nextSourceItems = operation === 'move'
		? sourceItems.filter(item => !item.path || !sourceKeys.has(pathKeys.source(item.path)))
		: sourceItems;
	const targetBase = samePane ? nextSourceItems : targetItems;
	const insertedTargetKeys = new Set<string>();
	const nextTargetItems: T[] = [];
	for (const item of targetBase) {
		const key = item.path ? pathKeys.target(item.path) : '';
		const replacement = targetItemsByKey.get(key);
		if (!replacement) {
			nextTargetItems.push(item);
			continue;
		}
		if (!insertedTargetKeys.has(key)) {
			nextTargetItems.push(replacement);
			insertedTargetKeys.add(key);
		}
	}
	for (const mutation of mutations) {
		if (!insertedTargetKeys.has(mutation.targetKey)) {
			nextTargetItems.push(mutation.targetItem);
			insertedTargetKeys.add(mutation.targetKey);
		}
	}

	if (samePane) {
		return { sourceItems: nextTargetItems, targetItems: nextTargetItems };
	}
	return { sourceItems: nextSourceItems, targetItems: nextTargetItems };
}

export function createTurboFilePostTransferRefreshPlan(
	operation: 'copy' | 'move',
	sourceSides: TurboFilePaneSide | readonly TurboFilePaneSide[],
	targetSides: TurboFilePaneSide | readonly TurboFilePaneSide[]
): readonly TurboFilePaneSide[] {
	const sources = typeof sourceSides === 'string' ? [sourceSides] : sourceSides;
	const targets = typeof targetSides === 'string' ? [targetSides] : targetSides;
	const plannedSides = operation === 'copy' ? targets : [...sources, ...targets];
	const uniqueSides: TurboFilePaneSide[] = [];
	for (const side of plannedSides) {
		if (!uniqueSides.includes(side)) {
			uniqueSides.push(side);
		}
	}
	return uniqueSides;
}
