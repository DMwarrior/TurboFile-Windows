/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ITurboFileRsyncSourceGroup {
	readonly sourceBase: string;
	readonly relativePaths: readonly string[];
}

export interface ITurboFileRsyncMappedSource {
	readonly sourcePath: string;
	readonly targetPath: string;
}

export interface ITurboFileRsyncMappedGroup extends ITurboFileRsyncSourceGroup {
	readonly targetBase: string;
}

/** Groups explicit rsync sources under stable roots so paths can be streamed with --files-from. */
export function createTurboFileRsyncSourceGroups(sourcePaths: readonly string[], flavor: 'posix' | 'windows'): ITurboFileRsyncSourceGroup[] {
	const groups = new Map<string, { sourceBase: string; relativePaths: string[] }>();
	for (const sourcePath of sourcePaths) {
		if (!sourcePath || sourcePath.includes('\0')) {
			throw new Error('Invalid rsync source path.');
		}
		const { parent: sourceBase, name: relativePath } = splitTurboFileRsyncPath(sourcePath, flavor);
		if (!sourceBase || sourceBase === sourcePath || !relativePath) {
			throw new Error('A filesystem root cannot be an explicit rsync source.');
		}
		const key = flavor === 'windows' ? sourceBase.toLowerCase() : sourceBase;
		let group = groups.get(key);
		if (!group) {
			group = { sourceBase, relativePaths: [] };
			groups.set(key, group);
		}
		group.relativePaths.push(relativePath);
	}
	return [...groups.values()];
}

/** Combines basename-preserving source/target mappings for reverse rsync worker manifests. */
export function createTurboFileRsyncMappedGroups(mappings: readonly ITurboFileRsyncMappedSource[]): { readonly groups: ITurboFileRsyncMappedGroup[]; readonly direct: ITurboFileRsyncMappedSource[] } {
	const groups = new Map<string, { sourceBase: string; targetBase: string; relativePaths: string[] }>();
	const direct: ITurboFileRsyncMappedSource[] = [];
	for (const mapping of mappings) {
		if (!mapping.sourcePath || !mapping.targetPath || mapping.sourcePath.includes('\0') || mapping.targetPath.includes('\0')) {
			throw new Error('Invalid rsync source mapping.');
		}
		const { parent: sourceBase, name: sourceName } = splitTurboFileRsyncPath(mapping.sourcePath, 'posix');
		const { parent: targetBase, name: targetName } = splitTurboFileRsyncPath(mapping.targetPath, 'posix');
		if (!sourceName || !targetName || sourceBase === mapping.sourcePath || targetBase === mapping.targetPath || sourceName !== targetName) {
			direct.push(mapping);
			continue;
		}
		const key = `${sourceBase}\0${targetBase}`;
		let group = groups.get(key);
		if (!group) {
			group = { sourceBase, targetBase, relativePaths: [] };
			groups.set(key, group);
		}
		group.relativePaths.push(sourceName);
	}
	return { groups: [...groups.values()], direct };
}

function splitTurboFileRsyncPath(path: string, flavor: 'posix' | 'windows'): { readonly parent: string; readonly name: string } {
	const slashIndex = path.lastIndexOf('/');
	const separatorIndex = flavor === 'windows' ? Math.max(slashIndex, path.lastIndexOf('\\')) : slashIndex;
	if (separatorIndex < 0) {
		return { parent: '', name: path };
	}
	let parent = path.slice(0, separatorIndex);
	if (!parent && separatorIndex === 0) {
		parent = '/';
	} else if (flavor === 'windows' && /^[A-Za-z]:$/.test(parent)) {
		parent += path.charAt(separatorIndex);
	}
	return { parent, name: path.slice(separatorIndex + 1) };
}
