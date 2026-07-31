/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Limiter } from '../../../base/common/async.js';
import { posix, win32 } from '../../../base/common/path.js';
import { localize } from '../../../nls.js';
import { ITurboFileFileOperationResult, ITurboFileTransferEndpoint } from './turbofile.js';

export function isTurboFileSafeDeletePath(path: string): boolean {
	const trimmed = path.trim();
	if (!trimmed) {
		return false;
	}
	const extendedUncPrefix = /^[\\/]{2}\?[\\/]UNC[\\/]/i;
	const normalizedInput = extendedUncPrefix.test(trimmed) ? `\\\\${trimmed.replace(extendedUncPrefix, '')}` : trimmed;
	const windowsPath = /^[A-Za-z]:[\\/]/.test(normalizedInput) || /^[\\/]{2}[^\\/]+[\\/][^\\/]+(?:[\\/]|$)/.test(normalizedInput);
	const pathApi = windowsPath ? win32 : posix;
	if (!pathApi.isAbsolute(normalizedInput)) {
		return false;
	}
	const normalized = pathApi.normalize(normalizedInput);
	const root = pathApi.parse(normalized).root;
	return windowsPath
		? normalized.toLowerCase() !== root.toLowerCase()
		: normalized !== root;
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

export async function runTurboFilePosixBatchDelete(
	endpoints: readonly ITurboFileTransferEndpoint[],
	workerLimit: number,
	batchDelete: () => Promise<unknown>,
	deletePath: (endpoint: ITurboFileTransferEndpoint) => Promise<ITurboFileFileOperationResult>,
	clearCache: (endpoint: ITurboFileTransferEndpoint) => void
): Promise<ITurboFileFileOperationResult> {
	if (endpoints.some(endpoint => !isTurboFileSafeDeletePath(endpoint.path))) {
		return { ok: false, message: 'Refusing to delete a filesystem root.' };
	}
	try {
		await batchDelete();
	} catch {
		return await runTurboFileBatchDeleteFallback(endpoints, workerLimit, deletePath);
	}
	for (const endpoint of endpoints) {
		clearCache(endpoint);
	}
	return { ok: true, message: 'Paths deleted.' };
}

export async function runTurboFileSingleRemoteDelete(
	endpoint: ITurboFileTransferEndpoint,
	nativeDelete: () => Promise<void>,
	sftpDelete: () => Promise<void>,
	clearCache: () => void
): Promise<ITurboFileFileOperationResult> {
	if (!isTurboFileSafeDeletePath(endpoint.path)) {
		return { ok: false, message: 'Refusing to delete a filesystem root.' };
	}
	try {
		await nativeDelete();
	} catch (nativeError) {
		try {
			await sftpDelete();
		} catch (sftpError) {
			const nativeMessage = nativeError instanceof Error ? nativeError.message : String(nativeError);
			const sftpMessage = sftpError instanceof Error ? sftpError.message : String(sftpError);
			return { ok: false, message: localize('turbofileSingleRemoteDeleteFailed', 'Native delete failed: {0}; SFTP delete failed: {1}', nativeMessage, sftpMessage) };
		}
	}
	clearCache();
	return { ok: true, message: 'Path deleted.' };
}
