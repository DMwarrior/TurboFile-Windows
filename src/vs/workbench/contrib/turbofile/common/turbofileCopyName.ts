/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface TurboFileCopyNameSource {
	readonly name: string;
	readonly directory: boolean;
}

/** Returns Windows-style copy names without repeatedly rebuilding the directory name set. */
export function createTurboFileCopyNames(items: readonly TurboFileCopyNameSource[], occupiedNames: Iterable<string>, caseSensitive: boolean): string[] {
	const normalize = caseSensitive ? (value: string) => value : (value: string) => value.toLocaleLowerCase();
	const occupied = new Set(Array.from(occupiedNames, normalize));
	return items.map(item => {
		const dotIndex = item.directory ? -1 : item.name.lastIndexOf('.');
		const hasExtension = dotIndex > 0;
		const stem = hasExtension ? item.name.slice(0, dotIndex) : item.name;
		const extension = hasExtension ? item.name.slice(dotIndex) : '';

		for (let copyNumber = 1; ; copyNumber++) {
			const suffix = copyNumber === 1 ? ' - 副本' : ` - 副本 (${copyNumber})`;
			const candidate = `${stem}${suffix}${extension}`;
			const normalizedCandidate = normalize(candidate);
			if (!occupied.has(normalizedCandidate)) {
				occupied.add(normalizedCandidate);
				return candidate;
			}
		}
	});
}

/**
 * Returns the first available Windows-style copy name in the current directory.
 *
 * The caller controls name comparison semantics so local Windows paths can be treated as
 * case-insensitive without changing the case-sensitive behaviour of SSH devices.
 */
export function createTurboFileCopyName(name: string, directory: boolean, occupiedNames: Iterable<string>, caseSensitive: boolean): string {
	return createTurboFileCopyNames([{ name, directory }], occupiedNames, caseSensitive)[0];
}
