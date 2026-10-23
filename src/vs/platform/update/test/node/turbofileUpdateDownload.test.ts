/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { createHash } from 'crypto';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { newWriteableBufferStream, VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { IRequestContext, IRequestOptions } from '../../../../base/parts/request/common/request.js';
import { downloadTurboFileUpdateFile, downloadTurboFileUpdateFiles } from '../../node/turbofileUpdateDownload.js';

suite('TurboFile update streaming download', () => {
	let folder: string;
	const payload = Buffer.from('verified-update-package');
	const hash = createHash('sha256').update(payload).digest('hex');
	setup(async () => { folder = await mkdtemp(join(tmpdir(), 'turbofile-update-')); });
	teardown(async () => { await rm(folder, { recursive: true, force: true }); });
	function response(data: Buffer, status = 200, headers: Record<string, string> = {}): IRequestContext {
		const stream = newWriteableBufferStream();
		stream.end(VSBuffer.wrap(data));
		return { res: { statusCode: status, headers: { 'content-length': String(data.length), ...headers } }, stream };
	}
	test('resumes a verified package and reports initial and final byte totals', async () => {
		const destination = join(folder, 'setup.exe');
		await writeFile(`${destination}.partial`, payload.subarray(0, 8));
		const progress: number[] = [];
		const headers: string[] = [];
		await downloadTurboFileUpdateFile({ request: async options => {
			headers.push(String(options.headers?.Range));
			return response(payload.subarray(8), 206, { 'content-range': `bytes 8-${payload.length - 1}/${payload.length}` });
		} }, destination, { urls: ['https://gitee.com/update'], size: payload.length, sha256: hash, onProgress: bytes => progress.push(bytes) });
		assert.deepStrictEqual({ headers, first: progress[0], last: progress.at(-1), data: (await readFile(destination)).toString() }, { headers: ['bytes=8-'], first: 8, last: payload.length, data: payload.toString() });
	});
	test('replaces partial bytes when the server ignores Range', async () => {
		const destination = join(folder, 'setup.exe');
		await writeFile(`${destination}.partial`, payload.subarray(0, 8));
		await downloadTurboFileUpdateFile({ request: async () => response(payload) }, destination, { urls: ['https://gitee.com/update'], sha256: hash, onProgress: () => { } });
		assert.deepStrictEqual(await readFile(destination), payload);
	});
	test('tries the domestic source before fallback and rejects corrupt bytes', async () => {
		const seen: string[] = [];
		await downloadTurboFileUpdateFile({ request: async options => {
			seen.push(options.url!);
			return response(options.url!.includes('gitee') ? Buffer.from('corrupt') : payload);
		} }, join(folder, 'setup.exe'), { urls: ['https://gitee.com/update', 'https://github.com/update'], sha256: hash, onProgress: () => { } });
		assert.deepStrictEqual(seen, ['https://gitee.com/update', 'https://gitee.com/update', 'https://github.com/update']);
	});
	test('rejects mismatched Content-Range rather than appending corrupt data', async () => {
		const destination = join(folder, 'setup.exe');
		await writeFile(`${destination}.partial`, payload.subarray(0, 8));
		let calls = 0;
		await downloadTurboFileUpdateFile({ request: async () => ++calls === 1 ? response(payload, 206, { 'content-range': `bytes 0-${payload.length - 1}/${payload.length}` }) : response(payload) }, destination, { urls: ['https://gitee.com/update'], sha256: hash, onProgress: () => { } });
		assert.deepStrictEqual({ calls, data: await readFile(destination) }, { calls: 2, data: payload });
	});
	test('updates progress during a continuous stream instead of waiting for quiet', async () => {
		const stream = newWriteableBufferStream();
		let reportsDuringDownload = 0;
		const task = downloadTurboFileUpdateFile({ request: async (_options: IRequestOptions) => ({ res: { statusCode: 200, headers: {} }, stream }) }, join(folder, 'setup.exe'), { urls: ['https://gitee.com/update'], onProgress: bytes => { if (bytes > 0 && bytes < 70) { reportsDuringDownload++; } } });
		for (let i = 0; i < 70; i++) { stream.write(VSBuffer.fromString('x')); await timeout(10); }
		stream.end();
		await task;
		assert.ok(reportsDuringDownload >= 2);
	});
	test('flushes the most recent bytes while waiting for the next network chunk', async () => {
		const stream = newWriteableBufferStream();
		const reports: number[] = [];
		const task = downloadTurboFileUpdateFile({ request: async () => ({ res: { statusCode: 200, headers: {} }, stream }) }, join(folder, 'setup.exe'), { urls: ['https://gitee.com/update'], onProgress: bytes => reports.push(bytes) });
		stream.write(VSBuffer.fromString('first'));
		await timeout(40);
		stream.write(VSBuffer.fromString('latest'));
		await timeout(300);
		const beforeEnd = reports.at(-1);
		stream.end();
		await task;
		assert.strictEqual(beforeEnd, 11);
	});
	test('limits independent part requests to two and aggregates out-of-order completions', async () => {
		const firstPair = new DeferredPromise<void>();
		const nextPart = new DeferredPromise<void>();
		const streams = Array.from({ length: 3 }, () => newWriteableBufferStream());
		const started: number[] = [];
		const reports: Array<{ bytes: number; total: number | undefined }> = [];
		const task = downloadTurboFileUpdateFiles({ request: async options => {
			const index = Number(options.url!.slice(-1));
			started.push(index);
			if (started.length === 2) { firstPair.complete(); }
			if (started.length === 3) { nextPart.complete(); }
			return { res: { statusCode: 200, headers: {} }, stream: streams[index] };
		} }, streams.map((_, index) => ({ destination: join(folder, `part-${index}`), urls: [`https://gitee.com/part-${index}`], size: payload.length, sha256: hash })), (bytes, total) => reports.push({ bytes, total }));
		await firstPair.p;
		const initial = [...started];
		streams[1].end(VSBuffer.wrap(payload));
		await nextPart.p;
		streams[2].end(VSBuffer.wrap(payload));
		streams[0].end(VSBuffer.wrap(payload));
		await task;
		assert.deepStrictEqual({ initial, started, last: reports.at(-1), monotonic: reports.every((report, index) => index === 0 || report.bytes >= reports[index - 1].bytes) }, { initial: [0, 1], started: [0, 1, 2], last: { bytes: payload.length * 3, total: payload.length * 3 }, monotonic: true });
	});
	test('cancels an unfinished sibling before failing the multipart download', async () => {
		let siblingToken = CancellationToken.None;
		const started: string[] = [];
		await assert.rejects(downloadTurboFileUpdateFiles({ request: async (options, token) => {
			started.push(options.url!);
			if (options.url!.endsWith('bad')) { return response(Buffer.alloc(0), 404); }
			siblingToken = token;
			return { res: { statusCode: 200, headers: {} }, stream: newWriteableBufferStream() };
		} }, ['bad', 'waiting', 'unused'].map(name => ({ destination: join(folder, name), urls: [`https://gitee.com/${name}`] })), () => { }), /HTTP 404/);
		assert.deepStrictEqual({ started, canceled: siblingToken.isCancellationRequested }, { started: ['https://gitee.com/bad', 'https://gitee.com/waiting', 'https://gitee.com/bad'], canceled: true });
	});
	test('cancels an active stream without retrying or leaving the output open', async () => {
		const source = new CancellationTokenSource();
		const active = new DeferredPromise<void>();
		let requests = 0;
		const task = downloadTurboFileUpdateFile({ request: async () => {
			requests++;
			return { res: { statusCode: 200, headers: {} }, stream: newWriteableBufferStream() };
		} }, join(folder, 'setup.exe'), { urls: ['https://gitee.com/update'], token: source.token, onProgress: () => active.complete() });
		await active.p;
		source.cancel();
		try {
			await assert.rejects(task, CancellationError);
			assert.strictEqual(requests, 1);
		} finally {
			source.dispose();
		}
	});
});
