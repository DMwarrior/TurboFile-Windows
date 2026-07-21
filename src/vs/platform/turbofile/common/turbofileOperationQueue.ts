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
}

interface ITurboFileQueuedOperation<T> {
	readonly readKeys: readonly string[];
	readonly writeKeys: readonly string[];
	readonly keys: ReadonlySet<string>;
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
		return new Promise<T>((resolve, reject) => {
			const entry: ITurboFileQueuedOperation<T> = {
				readKeys,
				writeKeys,
				keys: new Set([...readKeys, ...writeKeys]),
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
			if (this.activeAccess.has(key)) {
				return false;
			}
		}
		for (const key of entry.readKeys) {
			if (this.activeAccess.get(key)?.writer) {
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
		return entry.writeKeys.some(key => earlier.keys.has(key))
			|| entry.readKeys.some(key => earlier.writeKeys.includes(key));
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
	}

	private notify(callback: (() => void) | undefined): void {
		try {
			callback?.();
		} catch {
			// Observers only update UI state and must never strand acquired device keys.
		}
	}
}
