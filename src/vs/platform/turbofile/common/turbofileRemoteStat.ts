/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITurboFileEntryStat } from './turbofile.js';

export function buildPosixStatEntriesCommand(directoryPath: string, names: readonly string[]): string {
	const args = names.map(name => quotePosixShellArg(`./${normalizeRemoteEntryName(name)}`)).join(' ');
	return `cd ${quotePosixShellArg(directoryPath)} && { LC_ALL=C stat --printf='%n\\0%s\\0%Y\\0' -- ${args} || true; }`;
}

export function parseRemoteStatEntries(text: string): ITurboFileEntryStat[] {
	if (!text) {
		return [];
	}
	const parts = text.split('\0');
	const stats: ITurboFileEntryStat[] = [];
	for (let index = 0; index + 2 < parts.length; index += 3) {
		const rawName = parts[index];
		if (!rawName) {
			continue;
		}
		const name = rawName.replace(/^\.\//, '').replace(/\r?\n$/, '');
		if (!name) {
			continue;
		}
		const size = Number(parts[index + 1]);
		const modifiedSeconds = Number(parts[index + 2]);
		stats.push({
			name,
			size: Number.isFinite(size) ? size : 0,
			modified: Number.isFinite(modifiedSeconds) ? Math.floor(modifiedSeconds) * 1000 : 0
		});
	}
	return stats;
}

function normalizeRemoteEntryName(path: string): string {
	return path.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
}

function quotePosixShellArg(value: string): string {
	return "'" + value.replace(/'/g, "'\\''") + "'";
}
