/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createWriteStream } from 'fs';
import { rename, stat, unlink } from 'fs/promises';
import { timeout } from '../../../base/common/async.js';
import { CancellationTokenSource } from '../../../base/common/cancellation.js';
import { listenStream } from '../../../base/common/stream.js';
import { checksum } from '../../../base/node/crypto.js';
import { IRequestService } from '../../request/common/request.js';

export interface ITurboFileUpdateDownloadOptions {
	readonly urls: readonly string[];
	readonly size?: number;
	readonly sha256?: string;
	readonly onProgress: (bytes: number, total: number | undefined) => void;
}

/** Stream with disk backpressure, bounded retries and verified HTTP Range resume. */
export async function downloadTurboFileUpdateFile(requestService: Pick<IRequestService, 'request'>, destination: string, options: ITurboFileUpdateDownloadOptions): Promise<void> {
	const partial = `${destination}.partial`;
	if (options.sha256 && await stat(destination).then(info => !options.size || info.size === options.size, () => false)) {
		try {
			await checksum(destination, options.sha256);
			const size = (await stat(destination)).size;
			options.onProgress(size, options.size ?? size);
			return;
		} catch { await unlink(destination).catch(() => { }); }
	}
	let failure: Error = new Error('No update download source');
	for (const url of [...new Set(options.urls)]) {
		for (let attempt = 0; attempt < 2; attempt++) {
			const cancellation = new CancellationTokenSource();
			try {
				let offset = options.sha256 ? await stat(partial).then(info => info.size, () => 0) : 0;
				if (options.size && offset >= options.size) {
					if (offset === options.size && options.sha256) {
						try {
							await checksum(partial, options.sha256);
							await rename(partial, destination);
							options.onProgress(offset, options.size);
							return;
						} catch { /* Redownload incomplete or corrupt cached bytes. */ }
					}
					await unlink(partial).catch(() => { });
					offset = 0;
				}
				const context = await requestService.request({
					url, timeout: 15000, callSite: 'updateService.win32.downloadTurboFileUpdate',
					headers: { Accept: 'application/octet-stream', 'Accept-Encoding': 'identity', ...(offset ? { Range: `bytes=${offset}-` } : {}) }
				}, cancellation.token);
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
				let lastProgress = 0;
				options.onProgress(bytes, total);
				await new Promise<void>((resolve, reject) => {
					const output = createWriteStream(partial, { flags: offset ? 'a' : 'w' });
					let error: Error | undefined;
					const fail = (cause: Error) => {
						error ??= cause;
						context.stream.destroy();
						cancellation.cancel();
						output.destroy();
					};
					let idle = setTimeout(() => fail(new Error('Update download stalled')), 20000);
					output.on('error', fail);
					output.on('close', () => { clearTimeout(idle); error ? reject(error) : resolve(); });
					output.on('drain', () => context.stream.resume());
					listenStream(context.stream, {
						onData: data => {
							clearTimeout(idle);
							idle = setTimeout(() => fail(new Error('Update download stalled')), 20000);
							bytes += data.byteLength;
							if (total && bytes > total) { fail(new Error('Update exceeds expected size')); return; }
							if (!output.write(data.buffer)) { context.stream.pause(); }
							if (Date.now() - lastProgress >= 500) {
								lastProgress = Date.now();
								options.onProgress(bytes, total);
							}
						},
						onError: fail,
						onEnd: () => { clearTimeout(idle); output.end(); }
					});
				});
				if (total && bytes !== total) { throw new Error('Incomplete update download'); }
				if (options.sha256) {
					try { await checksum(partial, options.sha256); }
					catch (error) { await unlink(partial).catch(() => { }); throw error; }
				}
				await rename(partial, destination);
				options.onProgress(bytes, total ?? bytes);
				return;
			} catch (error) {
				failure = error instanceof Error ? error : new Error(String(error));
				if (attempt === 0) { await timeout(500); }
			} finally {
				cancellation.dispose(true);
			}
		}
	}
	throw failure;
}
