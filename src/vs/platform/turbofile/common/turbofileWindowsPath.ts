/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type WindowsPathResolver = (path: string) => Promise<string>;

const WINDOWS_PATH_RESOLVE_CONCURRENCY = 16;

export async function normalizeWindowsTransferPaths(paths: readonly string[], resolvePath: WindowsPathResolver): Promise<string[]> {
	const candidates: string[] = [];
	const seenCandidates = new Set<string>();
	for (const rawPath of paths) {
		const candidate = normalizeWindowsTransferPath(rawPath);
		if (!candidate) {
			continue;
		}
		const candidateKey = getWindowsTransferPathKey(candidate);
		if (seenCandidates.has(candidateKey)) {
			continue;
		}
		seenCandidates.add(candidateKey);
		candidates.push(candidate);
	}

	// Explorer may hand us tens of thousands of paths. Resolve a bounded number in parallel so
	// normalisation does not become a long serial pre-transfer phase or flood libuv's worker pool.
	const resolvedPaths = new Array<string>(candidates.length);
	let cursor = 0;
	const worker = async (): Promise<void> => {
		while (cursor < candidates.length) {
			const index = cursor++;
			const candidate = candidates[index];
			resolvedPaths[index] = normalizeWindowsTransferPath(await resolvePath(candidate).catch(() => candidate)) ?? candidate;
		}
	};
	await Promise.all(Array.from({ length: Math.min(WINDOWS_PATH_RESOLVE_CONCURRENCY, candidates.length) }, () => worker()));

	const result: string[] = [];
	const seen = new Set<string>();
	for (const resolved of resolvedPaths) {
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
