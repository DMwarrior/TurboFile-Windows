/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createWriteStream } from 'fs';
import { rename, stat, unlink } from 'fs/promises';
import { timeout } from '../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { CancellationError } from '../../../base/common/errors.js';
import { listenStream } from '../../../base/common/stream.js';
import { checksum } from '../../../base/node/crypto.js';
import { IRequestService } from '../../request/common/request.js';

export interface ITurboFileUpdateDownloadOptions {
	readonly urls: readonly string[];
	readonly size?: number;
	readonly sha256?: string;
	readonly onProgress: (bytes: number, total: number | undefined) => void;
	readonly token?: CancellationToken;
}

export interface ITurboFileUpdateDownloadFile extends Omit<ITurboFileUpdateDownloadOptions, 'onProgress' | 'token'> {
	readonly destination: string;
}

/** Download independent parts with at most two connections and one aggregate progress counter. */
export async function downloadTurboFileUpdateFiles(requestService: Pick<IRequestService, 'request'>, files: readonly ITurboFileUpdateDownloadFile[], onProgress: ITurboFileUpdateDownloadOptions['onProgress'], token = CancellationToken.None): Promise<void> {
	const cancellation = new CancellationTokenSource(token);
	const bytes = files.map(() => 0);
	const totals = files.map(file => file.size);
	let next = 0;
	let failure: Error | undefined;
	const report = () => onProgress(bytes.reduce((sum, value) => sum + value, 0), totals.every(total => total !== undefined) ? totals.reduce<number>((sum, value) => sum + (value ?? 0), 0) : undefined);
	try {
		report();
		await Promise.all(Array.from({ length: Math.min(2, files.length) }, async () => {
			while (next < files.length && !cancellation.token.isCancellationRequested) {
				const index = next++;
				const file = files[index];
				try {
					await downloadTurboFileUpdateFile(requestService, file.destination, {
						...file, token: cancellation.token,
						onProgress: (downloaded, total) => { bytes[index] = downloaded; totals[index] = total; report(); }
					});
				} catch (error) {
					failure ??= error instanceof Error ? error : new Error(String(error));
					cancellation.cancel();
				}
			}
		}));
		if (failure) { throw failure; }
		if (token.isCancellationRequested) { throw new CancellationError(); }
	} finally {
		cancellation.dispose(true);
	}
}

/** Stream with disk backpressure, bounded retries and verified HTTP Range resume. */
export async function downloadTurboFileUpdateFile(requestService: Pick<IRequestService, 'request'>, destination: string, options: ITurboFileUpdateDownloadOptions): Promise<void> {
	const token = options.token ?? CancellationToken.None;
	if (token.isCancellationRequested) { throw new CancellationError(); }
	const partial = `${destination}.partial`;
	if (options.sha256 && await stat(destination).then(info => !options.size || info.size === options.size, () => false)) {
		try {
			await checksum(destination, options.sha256);
			if (token.isCancellationRequested) { throw new CancellationError(); }
			const size = (await stat(destination)).size;
			options.onProgress(size, options.size ?? size);
			return;
		} catch (error) {
			if (token.isCancellationRequested) { throw error; }
			await unlink(destination).catch(() => { });
		}
	}
	let failure: Error = new Error('No update download source');
	for (const url of [...new Set(options.urls)]) {
		for (let attempt = 0; attempt < 2; attempt++) {
			const cancellation = new CancellationTokenSource(token);
			try {
				if (token.isCancellationRequested) { throw new CancellationError(); }
				let offset = options.sha256 ? await stat(partial).then(info => info.size, () => 0) : 0;
				if (options.size && offset >= options.size) {
					if (offset === options.size && options.sha256) {
						try {
							await checksum(partial, options.sha256);
							if (token.isCancellationRequested) { throw new CancellationError(); }
							await rename(partial, destination);
							options.onProgress(offset, options.size);
							return;
						} catch (error) {
							if (token.isCancellationRequested) { throw error; }
							// Redownload incomplete or corrupt cached bytes.
						}
					}
					await unlink(partial).catch(() => { });
					offset = 0;
				}
				const context = await requestService.request({
					url, timeout: 15000, streamResponse: true, callSite: 'updateService.win32.downloadTurboFileUpdate',
					headers: { Accept: 'application/octet-stream', 'Accept-Encoding': 'identity', ...(offset ? { Range: `bytes=${offset}-` } : {}) }
				}, cancellation.token);
				if (cancellation.token.isCancellationRequested) { context.stream.destroy(); throw new CancellationError(); }
				const status = context.res.statusCode ?? 200;
				if (status !== 200 && status !== 206) {
					context.stream.destroy();
					throw new Error(`Update download returned HTTP ${status}`);
				}
				const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(String(context.res.headers['content-range'] ?? ''));
				if (status === 206 && (!range || Number(range[1]) !== offset || Number(range[2]) < offset || Number(range[3]) <= Number(range[2]) || (options.size && Number(range[3]) !== options.size))) {
					context.stream.destroy();
					await unlink(partial).catch(() => { });
					throw new Error('Invalid update resume response');
				}
				if (status === 200) {
					offset = 0; // A server ignoring Range must replace, never append.
				}
				const length = Number(context.res.headers['content-length']);
				const total = options.size ?? (range ? Number(range[3]) : Number.isSafeInteger(length) && length > 0 ? length : undefined);
				let bytes = offset;
				let lastProgress = Date.now();
				options.onProgress(bytes, total);
				await new Promise<void>((resolve, reject) => {
					const output = createWriteStream(partial, { flags: offset ? 'a' : 'w', highWaterMark: 256 * 1024 });
					let error: Error | undefined;
					let pendingProgress: ReturnType<typeof setTimeout> | undefined;
					const report = () => {
						pendingProgress = undefined;
						lastProgress = Date.now();
						options.onProgress(bytes, total);
					};
					const fail = (cause: Error) => {
						if (error) { return; }
						error = cause;
						clearTimeout(pendingProgress);
						context.stream.destroy();
						cancellation.cancel();
						output.destroy();
					};
					let idle = setTimeout(() => fail(new Error('Update download stalled')), 20000);
					const cancellationListener = cancellation.token.onCancellationRequested(() => fail(new CancellationError()));
					output.on('error', fail);
					output.on('close', () => { clearTimeout(idle); clearTimeout(pendingProgress); cancellationListener.dispose(); error ? reject(error) : resolve(); });
					output.on('drain', () => context.stream.resume());
					listenStream(context.stream, {
						onData: data => {
							clearTimeout(idle);
							idle = setTimeout(() => fail(new Error('Update download stalled')), 20000);
							bytes += data.byteLength;
							if (total && bytes > total) { fail(new Error('Update exceeds expected size')); return; }
							if (!output.write(data.buffer)) { context.stream.pause(); }
							if (!pendingProgress) {
								pendingProgress = setTimeout(report, Math.max(0, 250 - (Date.now() - lastProgress)));
							}
						},
						onError: fail,
						onEnd: () => { clearTimeout(idle); output.end(); }
					}, cancellation.token);
				});
				if (total && bytes !== total) { throw new Error('Incomplete update download'); }
				if (token.isCancellationRequested) { throw new CancellationError(); }
				if (options.sha256) {
					try { await checksum(partial, options.sha256); }
					catch (error) { await unlink(partial).catch(() => { }); throw error; }
				}
				if (token.isCancellationRequested) { throw new CancellationError(); }
				await rename(partial, destination);
				options.onProgress(bytes, total ?? bytes);
				return;
			} catch (error) {
				if (token.isCancellationRequested) { throw new CancellationError(); }
				failure = error instanceof Error ? error : new Error(String(error));
				if (attempt === 0) { await timeout(500); }
			} finally {
				cancellation.dispose(true);
			}
		}
	}
	throw failure;
}
