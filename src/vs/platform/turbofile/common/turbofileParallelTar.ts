/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Collects every parent needed by a relative tar manifest before parallel extraction starts. */
export function getTurboFileTarParentDirectories(entries: readonly string[]): string[] {
	const directories = new Set<string>();
	for (const entry of entries) {
		let end = entry.lastIndexOf('/');
		while (end > 0) {
			directories.add(entry.substring(0, end));
			end = entry.lastIndexOf('/', end - 1);
		}
	}
	return Array.from(directories).sort();
}

/** Stops scheduling after the first failure, but drains active writers before permitting a fallback. */
export async function runTurboFileParallelTarTasks<T>(items: readonly T[], concurrency: number, run: (item: T, shouldStop: () => boolean) => Promise<void>): Promise<void> {
	let nextIndex = 0;
	let failed = false;
	let firstError: unknown;
	const shouldStop = (): boolean => failed;
	const worker = async (): Promise<void> => {
		while (!failed && nextIndex < items.length) {
			const item = items[nextIndex++];
			try {
				await run(item, shouldStop);
			} catch (error) {
				if (!failed) {
					firstError = error;
					failed = true;
				}
			}
		}
	};
	await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, worker));
	if (failed) {
		throw firstError;
	}
}
