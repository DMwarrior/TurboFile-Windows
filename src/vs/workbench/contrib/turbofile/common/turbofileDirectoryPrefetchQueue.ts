/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

interface TurboFileDirectoryPrefetchQueueEntry {
	readonly key: string;
	readonly task: () => Promise<void>;
}

export class TurboFileDirectoryPrefetchQueue {

	private readonly queuedKeys = new Set<string>();
	private readonly runningKeys = new Set<string>();
	private readonly queue: TurboFileDirectoryPrefetchQueueEntry[] = [];
	private active = 0;
	private idleResolvers: Array<() => void> = [];

	constructor(private readonly concurrency: number) { }

	enqueue(key: string, task: () => Promise<void>): void {
		if (!key || this.queuedKeys.has(key) || this.runningKeys.has(key)) {
			return;
		}
		this.queuedKeys.add(key);
		this.queue.push({ key, task });
		this.drain();
	}

	/**
	 * Move an already-queued key to the front so the directory the user is about to open is loaded
	 * next, instead of waiting behind a backlog of neighbour prefetches. No-op if the key is not
	 * currently queued (e.g. it is already running or finished).
	 */
	prioritize(key: string): void {
		if (!key || !this.queuedKeys.has(key)) {
			return;
		}
		const index = this.queue.findIndex(entry => entry.key === key);
		if (index > 0) {
			const [entry] = this.queue.splice(index, 1);
			this.queue.unshift(entry);
		}
	}

	whenIdle(): Promise<void> {
		if (!this.active && !this.queue.length) {
			return Promise.resolve();
		}
		return new Promise(resolve => this.idleResolvers.push(resolve));
	}

	private drain(): void {
		while (this.active < this.concurrency && this.queue.length) {
			const entry = this.queue.shift()!;
			this.queuedKeys.delete(entry.key);
			this.runningKeys.add(entry.key);
			this.active++;
			void entry.task().finally(() => {
				this.runningKeys.delete(entry.key);
				this.active--;
				this.drain();
				this.resolveIdleIfNeeded();
			});
		}
	}

	private resolveIdleIfNeeded(): void {
		if (this.active || this.queue.length) {
			return;
		}
		const resolvers = this.idleResolvers;
		this.idleResolvers = [];
		for (const resolve of resolvers) {
			resolve();
		}
	}
}
