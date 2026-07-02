/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type TurboFileDirectoryLoadPurpose = 'foreground' | 'prefetch';

interface TurboFileDirectoryInflightEntry<T> {
	readonly purpose: TurboFileDirectoryLoadPurpose;
	readonly promise: Promise<T>;
}

export class TurboFileDirectoryInflightTracker<T> {

	private readonly entries = new Map<string, TurboFileDirectoryInflightEntry<T>>();

	getReusable(key: string, purpose: TurboFileDirectoryLoadPurpose): Promise<T> | undefined {
		void purpose;
		const entry = this.entries.get(key);
		if (!entry) {
			return undefined;
		}
		return entry.promise;
	}

	has(key: string): boolean {
		return this.entries.has(key);
	}

	set(key: string, purpose: TurboFileDirectoryLoadPurpose, promise: Promise<T>): void {
		const entry = { purpose, promise };
		this.entries.set(key, entry);
		void promise.then(
			() => this.deleteIfCurrent(key, entry),
			() => this.deleteIfCurrent(key, entry)
		);
	}

	delete(key: string): void {
		this.entries.delete(key);
	}

	keys(): IterableIterator<string> {
		return this.entries.keys();
	}

	private deleteIfCurrent(key: string, entry: TurboFileDirectoryInflightEntry<T>): void {
		if (this.entries.get(key) === entry) {
			this.entries.delete(key);
		}
	}
}
