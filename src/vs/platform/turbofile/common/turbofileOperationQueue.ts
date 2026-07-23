/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ITurboFileOperationQueueOptions {
	readonly id?: string;
	readonly onQueued?: () => void;
	readonly onStarted?: () => void;
}

export interface ITurboFileOperationAccess {
	readonly read?: readonly string[];
	readonly write?: readonly string[];
	readonly limited?: readonly ITurboFileOperationLimitedAccess[];
}

export interface ITurboFileOperationLimitedAccess {
	readonly key: string;
	readonly limit: number;
	readonly weight?: number;
}

interface ITurboFileQueuedOperation<T> {
	readonly readKeys: readonly string[];
	readonly writeKeys: readonly string[];
	readonly keys: ReadonlySet<string>;
	readonly limited: readonly ITurboFileOperationLimitedAccess[];
	readonly operation: () => Promise<T>;
	readonly options: ITurboFileOperationQueueOptions;
	readonly resolve: (value: T | PromiseLike<T>) => void;
	readonly reject: (reason?: unknown) => void;
	started: boolean;
}

interface ITurboFileActiveAccess {
	readers: number;
	writer: boolean;
}

export class TurboFileOperationCanceledError extends Error {
	constructor() {
		super('Operation canceled while waiting for the device.');
		this.name = 'TurboFileOperationCanceledError';
	}
}

/**
 * Coordinates shared reads and exclusive writes without imposing a global
 * lock. Operations acquire all sorted device keys atomically, so opposite
 * transfer directions cannot deadlock. Disjoint devices remain concurrent.
 */
export class TurboFileOperationQueue {
	private readonly pending: ITurboFileQueuedOperation<unknown>[] = [];
	private readonly activeAccess = new Map<string, ITurboFileActiveAccess>();
	private readonly activeLimited = new Map<string, number>();

	run<T>(keys: readonly string[], operation: () => Promise<T>, options: ITurboFileOperationQueueOptions = {}): Promise<T> {
		return this.runWithAccess({ write: keys }, operation, options);
	}

	/** Runs an operation with shared access to each device key. */
	runShared<T>(keys: readonly string[], operation: () => Promise<T>, options: ITurboFileOperationQueueOptions = {}): Promise<T> {
		return this.runWithAccess({ read: keys }, operation, options);
	}

	/**
	 * Acquires all requested device keys atomically. Read access may overlap other
	 * readers, while write access is exclusive. A key requested for both modes is
	 * normalized to write access.
	 */
	runWithAccess<T>(access: ITurboFileOperationAccess, operation: () => Promise<T>, options: ITurboFileOperationQueueOptions = {}): Promise<T> {
		const writeKeys = [...new Set((access.write ?? []).filter(Boolean))].sort();
		const writeKeySet = new Set(writeKeys);
		const readKeys = [...new Set((access.read ?? []).filter(key => Boolean(key) && !writeKeySet.has(key)))].sort();
		const limited = normalizeLimitedAccess(access.limited ?? []);
		return new Promise<T>((resolve, reject) => {
			const entry: ITurboFileQueuedOperation<T> = {
				readKeys,
				writeKeys,
				keys: new Set([...readKeys, ...writeKeys]),
				limited,
				operation,
				options,
				resolve,
				reject,
				started: false
			};
			this.pending.push(entry as ITurboFileQueuedOperation<unknown>);
			this.drain();
			if (!entry.started) {
				this.notify(options.onQueued);
			}
		});
	}

	cancel(id: string): boolean {
		const index = this.pending.findIndex(entry => !entry.started && entry.options.id === id);
		if (index < 0) {
			return false;
		}
		const [entry] = this.pending.splice(index, 1);
		entry.reject(new TurboFileOperationCanceledError());
		this.drain();
		return true;
	}

	private drain(): void {
		for (let index = 0; index < this.pending.length;) {
			const entry = this.pending[index];
			if (!this.canStart(entry, index)) {
				index++;
				continue;
			}

			this.pending.splice(index, 1);
			entry.started = true;
			this.acquire(entry);
			this.notify(entry.options.onStarted);
			void Promise.resolve()
				.then(entry.operation)
				.finally(() => {
					this.release(entry);
					this.drain();
				})
				.then(entry.resolve, entry.reject);
		}
	}

	private canStart(entry: ITurboFileQueuedOperation<unknown>, index: number): boolean {
		for (const key of entry.writeKeys) {
			if ([...this.activeAccess.keys()].some(activeKey => operationKeysConflict(key, activeKey))) {
				return false;
			}
		}
		for (const key of entry.readKeys) {
			if ([...this.activeAccess].some(([activeKey, access]) => access.writer && operationKeysConflict(key, activeKey))) {
				return false;
			}
		}
		for (const claim of entry.limited) {
			if ((this.activeLimited.get(claim.key) ?? 0) + (claim.weight ?? 1) > claim.limit) {
				return false;
			}
		}
		for (let earlierIndex = 0; earlierIndex < index; earlierIndex++) {
			const earlier = this.pending[earlierIndex];
			if (this.conflicts(entry, earlier)) {
				return false;
			}
		}
		return true;
	}

	private conflicts(entry: ITurboFileQueuedOperation<unknown>, earlier: ITurboFileQueuedOperation<unknown>): boolean {
		return entry.writeKeys.some(key => [...earlier.keys].some(earlierKey => operationKeysConflict(key, earlierKey)))
			|| entry.readKeys.some(key => earlier.writeKeys.some(earlierKey => operationKeysConflict(key, earlierKey)))
			|| entry.limited.some(claim => earlier.limited.some(earlierClaim => claim.key === earlierClaim.key));
	}

	private acquire(entry: ITurboFileQueuedOperation<unknown>): void {
		for (const key of entry.writeKeys) {
			this.activeAccess.set(key, { readers: 0, writer: true });
		}
		for (const key of entry.readKeys) {
			const active = this.activeAccess.get(key);
			if (active) {
				active.readers++;
			} else {
				this.activeAccess.set(key, { readers: 1, writer: false });
			}
		}
		for (const claim of entry.limited) {
			this.activeLimited.set(claim.key, (this.activeLimited.get(claim.key) ?? 0) + (claim.weight ?? 1));
		}
	}

	private release(entry: ITurboFileQueuedOperation<unknown>): void {
		for (const key of entry.writeKeys) {
			this.activeAccess.delete(key);
		}
		for (const key of entry.readKeys) {
			const active = this.activeAccess.get(key);
			if (!active || active.readers <= 1) {
				this.activeAccess.delete(key);
			} else {
				active.readers--;
			}
		}
		for (const claim of entry.limited) {
			const active = this.activeLimited.get(claim.key) ?? 0;
			const weight = claim.weight ?? 1;
			if (active <= weight) {
				this.activeLimited.delete(claim.key);
			} else {
				this.activeLimited.set(claim.key, active - weight);
			}
		}
	}

	private notify(callback: (() => void) | undefined): void {
		try {
			callback?.();
		} catch {
			// Observers only update UI state and must never strand acquired device keys.
		}
	}
}

function normalizeLimitedAccess(access: readonly ITurboFileOperationLimitedAccess[]): ITurboFileOperationLimitedAccess[] {
	const claims = new Map<string, { limit: number; weight: number }>();
	for (const claim of access) {
		if (!claim.key) {
			continue;
		}
		const limit = Math.max(1, Math.floor(claim.limit));
		const weight = Math.min(limit, Math.max(1, Math.floor(claim.weight ?? 1)));
		const existing = claims.get(claim.key);
		claims.set(claim.key, {
			limit: Math.min(existing?.limit ?? limit, limit),
			weight: Math.max(existing?.weight ?? weight, weight)
		});
	}
	return [...claims].map(([key, claim]) => ({ key, limit: claim.limit, weight: Math.min(claim.limit, claim.weight) })).sort((left, right) => left.key.localeCompare(right.key));
}

function operationKeysConflict(left: string, right: string): boolean {
	if (left === right) {
		return true;
	}
	const leftPath = parsePathKey(left);
	const rightPath = parsePathKey(right);
	if (!leftPath || !rightPath || leftPath.device !== rightPath.device) {
		return false;
	}
	return isSameOrAncestorPath(leftPath.path, rightPath.path) || isSameOrAncestorPath(rightPath.path, leftPath.path);
}

function parsePathKey(key: string): { readonly device: string; readonly path: string } | undefined {
	if (!key.startsWith('path:')) {
		return undefined;
	}
	const separator = key.indexOf('|', 5);
	return separator < 0 ? undefined : { device: key.slice(5, separator), path: key.slice(separator + 1) };
}

function isSameOrAncestorPath(parent: string, child: string): boolean {
	return parent === child || child.startsWith(parent.endsWith('/') ? parent : `${parent}/`);
}
