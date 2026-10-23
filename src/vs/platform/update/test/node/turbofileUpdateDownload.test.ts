/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { createHash } from 'crypto';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { timeout } from '../../../../base/common/async.js';
import { newWriteableBufferStream, VSBuffer } from '../../../../base/common/buffer.js';
import { IRequestContext, IRequestOptions } from '../../../../base/parts/request/common/request.js';
import { downloadTurboFileUpdateFile } from '../../node/turbofileUpdateDownload.js';

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
});
