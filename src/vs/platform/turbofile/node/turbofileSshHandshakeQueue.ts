/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

interface IHostHandshakes {
	active: number;
	readonly waiting: Array<() => void>;
}

/** Limit connection bursts, without limiting authenticated connections or their data streams. */
export class TurboFileSshHandshakeQueue {
	private readonly hosts = new Map<string, IHostHandshakes>();

	acquire(host: string, port: number, signal: AbortSignal): Promise<() => void> {
		if (signal.aborted) {
			return Promise.reject(signal.reason);
		}
		// sshd applies its unauthenticated connection limit across user accounts.
		const key = JSON.stringify([host.trim().toLowerCase(), port || 22]);
		let state = this.hosts.get(key);
		if (!state) {
			state = { active: 0, waiting: [] };
			this.hosts.set(key, state);
		}
		const current = state;
		return new Promise<() => void>((resolve, reject) => {
			const start = (): void => {
				signal.removeEventListener('abort', cancel);
				current.active++;
				let released = false;
				resolve(() => {
					if (released) { return; }
					released = true;
					current.active--;
					while (current.active < 4 && current.waiting.length > 0) {
						current.waiting.shift()!();
					}
					this.removeIdleHost(key, current);
				});
			};
			const cancel = (): void => {
				const index = current.waiting.indexOf(start);
				if (index < 0) { return; }
				current.waiting.splice(index, 1);
				signal.removeEventListener('abort', cancel);
				this.removeIdleHost(key, current);
				reject(signal.reason);
			};
			if (current.active < 4) {
				start();
			} else {
				current.waiting.push(start);
				signal.addEventListener('abort', cancel, { once: true });
			}
		});
	}

	private removeIdleHost(key: string, state: IHostHandshakes): void {
		if (state.active === 0 && state.waiting.length === 0) {
			this.hosts.delete(key);
		}
	}
}
