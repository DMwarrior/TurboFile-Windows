/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export class TurboFileKeyedGeneration {
	private sequence = 0;
	private readonly currentByKey = new Map<string, number>();

	next(key: string): number {
		const generation = ++this.sequence;
		this.currentByKey.set(key, generation);
		return generation;
	}

	current(key: string): number | undefined {
		return this.currentByKey.get(key);
	}

	isCurrent(key: string, generation: number): boolean {
		return this.currentByKey.get(key) === generation;
	}

	clearIfCurrent(key: string, generation: number): boolean {
		if (!this.isCurrent(key, generation)) {
			return false;
		}
		this.currentByKey.delete(key);
		return true;
	}
}
