/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Limiter } from '../../../base/common/async.js';
import { ITurboFileFileOperationResult, ITurboFileTransferEndpoint } from './turbofile.js';

export function isTurboFileSafeDeletePath(path: string): boolean {
	const trimmed = path.trim();
	const normalized = trimmed.replace(/[\\/]+$/, '');
	return !!trimmed && trimmed !== '/' && trimmed !== '\\' && normalized !== '' && !/^[A-Za-z]:$/.test(normalized);
}

export async function runTurboFileBatchDeleteFallback(
	endpoints: readonly ITurboFileTransferEndpoint[],
	workerLimit: number,
	deletePath: (endpoint: ITurboFileTransferEndpoint) => Promise<ITurboFileFileOperationResult>
): Promise<ITurboFileFileOperationResult> {
	const concurrency = Number.isFinite(workerLimit) ? Math.max(1, Math.floor(workerLimit)) : 1;
	const limiter = new Limiter<ITurboFileFileOperationResult>(concurrency);
	try {
		const results = await Promise.all(endpoints.map(endpoint => limiter.queue(async () => {
			try {
				return await deletePath(endpoint);
			} catch (error) {
				return { ok: false, message: error instanceof Error ? error.message : String(error) };
			}
		})));
		const failures = results
			.map((result, index) => ({ endpoint: endpoints[index], result }))
			.filter(({ result }) => !result.ok);
		if (failures.length) {
			return { ok: false, message: failures.map(({ endpoint, result }) => `${endpoint.path}: ${result.message}`).join('; ') };
		}
		return { ok: true, message: 'Paths deleted.' };
	} finally {
		limiter.dispose();
	}
}
