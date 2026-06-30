/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type WindowsPathResolver = (path: string) => Promise<string>;

export async function normalizeWindowsTransferPaths(paths: readonly string[], resolvePath: WindowsPathResolver): Promise<string[]> {
	const result: string[] = [];
	const seen = new Set<string>();

	for (const rawPath of paths) {
		const candidate = normalizeWindowsTransferPath(rawPath);
		if (!candidate) {
			continue;
		}

		const resolved = normalizeWindowsTransferPath(await resolvePath(candidate).catch(() => candidate)) ?? candidate;
		const key = getWindowsTransferPathKey(resolved);
		if (seen.has(key)) {
			continue;
		}

		seen.add(key);
		result.push(resolved);
	}

	return result;
}

export function getWindowsTransferPathKey(path: string): string {
	return path.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
}

function normalizeWindowsTransferPath(path: string): string | undefined {
	const trimmed = path.trim().replace(/^"|"$/g, '').replace(/^file:\/\/\/?/i, '');
	return trimmed || undefined;
}
