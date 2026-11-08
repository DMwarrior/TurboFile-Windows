/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const DIRECT_TAR_BYTE_PROGRESS_PATTERN = /(?:^|[\r\n])\s*([0-9]+)\s+bytes(?:\s|\()/g;

/** Reports only new archive bytes when a chunk or a complete upload is retried. */
export function createTarRetryProgressReporter(onDelta?: (delta: number) => void): () => (delta: number) => void {
	let maximumBytes = 0;
	return () => {
		let attemptBytes = 0;
		return delta => {
			attemptBytes += Math.max(0, delta);
			if (attemptBytes > maximumBytes) {
				const additionalBytes = attemptBytes - maximumBytes;
				maximumBytes = attemptBytes;
				onDelta?.(additionalBytes);
			}
		};
	};
}

/**
 * Parses the byte counter emitted by GNU coreutils `dd status=progress`.
 * The parser accepts a rolling stderr buffer because SSH may split a progress line across chunks.
 */
export function parseDirectTarProgressBytes(output: string): number | undefined {
	let maximum: number | undefined;
	let match: RegExpExecArray | null;
	DIRECT_TAR_BYTE_PROGRESS_PATTERN.lastIndex = 0;
	while ((match = DIRECT_TAR_BYTE_PROGRESS_PATTERN.exec(output)) !== null) {
		const bytes = Number(match[1]);
		if (Number.isSafeInteger(bytes) && bytes >= 0) {
			maximum = Math.max(maximum ?? 0, bytes);
		}
	}
	return maximum;
}
