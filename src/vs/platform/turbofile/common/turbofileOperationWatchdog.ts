/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

interface IPendingOperation {
	lastActivityAt: number;
	readonly timeoutMs: number;
	readonly message: string;
	readonly reject: (error: Error) => void;
}

/** Bounds silent transport operations without timing out transfers that keep making progress. */
export class TurboFileOperationWatchdog {
	private readonly pending = new Set<IPendingOperation>();
	private timer: ReturnType<typeof setInterval> | undefined;
	private failure: Error | undefined;

	constructor(private readonly abort: () => void) { }

	/** Prevent late preparation callbacks from starting work after the owning operation stopped. */
	throwIfFailed(): void {
		if (this.failure) {
			throw this.failure;
		}
	}

	run<T>(start: (reportActivity: () => void) => Promise<T>, timeoutMs: number, message: string): Promise<T> {
		if (this.failure) {
			return Promise.reject(this.failure);
		}
		return new Promise<T>((resolve, reject) => {
			const operation: IPendingOperation = { lastActivityAt: Date.now(), timeoutMs, message, reject };
			this.pending.add(operation);
			if (!this.timer) {
				this.timer = setInterval(() => {
					const now = Date.now();
					for (const candidate of this.pending) {
						if (now - candidate.lastActivityAt >= candidate.timeoutMs) {
							// Fail every request before aborting: a dead channel cannot be used for
							// retries or handle cleanup, even if its callbacks never arrive.
							this.fail(new Error(candidate.message));
							try {
								this.abort();
							} catch {
								// Requests already failed; a broken transport may also throw during cleanup.
							}
							break;
						}
					}
				}, 1000);
			}
			const finish = (callback: () => void): void => {
				if (this.pending.delete(operation)) {
					this.clearIdleTimer();
					callback();
				}
			};
			try {
				start(() => operation.lastActivityAt = Date.now()).then(
					value => finish(() => resolve(value)),
					error => finish(() => reject(error))
				);
			} catch (error) {
				finish(() => reject(error));
			}
		});
	}

	/** Reject pending and future requests when the transport closes or fails. */
	fail(error: Error): void {
		this.failure ??= error;
		for (const operation of this.pending) {
			operation.reject(this.failure);
		}
		this.pending.clear();
		this.clearIdleTimer();
	}

	private clearIdleTimer(): void {
		if (this.pending.size === 0 && this.timer) {
			clearInterval(this.timer);
			this.timer = undefined;
		}
	}
}
