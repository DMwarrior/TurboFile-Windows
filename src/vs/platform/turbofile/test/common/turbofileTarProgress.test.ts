/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { createTarRetryProgressReporter, parseDirectTarProgressBytes } from '../../common/turbofileTarProgress.js';

suite('TurboFileTarProgress', () => {
	test('does not count an uploaded prefix again after retry', () => {
		const deltas: number[] = [];
		const startAttempt = createTarRetryProgressReporter(delta => deltas.push(delta));
		const first = startAttempt();
		first(100);
		first(50);
		const retry = startAttempt();
		retry(80);
		retry(70);
		retry(20);
		assert.deepStrictEqual(deltas, [100, 50, 20]);
	});

	test('counts independent chunks while deduplicating each chunk retry', () => {
		let bytes = 0;
		const report = (delta: number) => bytes += delta;
		const firstChunk = createTarRetryProgressReporter(report);
		const secondChunk = createTarRetryProgressReporter(report);
		firstChunk()(100);
		secondChunk()(200);
		const retry = firstChunk();
		retry(100);
		retry(50);
		assert.strictEqual(bytes, 350);
	});

	test('does not count retransmission again when the complete upload falls back', () => {
		let bytes = 0;
		const startUpload = createTarRetryProgressReporter(delta => bytes += delta);
		const parallel = startUpload();
		const firstChunk = createTarRetryProgressReporter(parallel);
		const secondChunk = createTarRetryProgressReporter(parallel);
		firstChunk()(100);
		secondChunk()(150);
		firstChunk()(120);
		const fallback = startUpload();
		fallback(200);
		fallback(80);
		assert.strictEqual(bytes, 280);
	});

	test('parses live and final dd byte counters', () => {
		assert.strictEqual(parseDirectTarProgressBytes('\r4194304 bytes (4.2 MB, 4.0 MiB) copied, 1 s, 4.2 MB/s'), 4194304);
		assert.strictEqual(parseDirectTarProgressBytes('1+0 records in\n1+0 records out\n10485760 bytes (10 MB, 10 MiB) copied, 2.1 s, 5.0 MB/s\n'), 10485760);
	});

	test('returns the newest maximum from a rolling stderr buffer', () => {
		assert.strictEqual(parseDirectTarProgressBytes('\r4096 bytes copied\r8192 bytes copied\r6144 bytes copied'), 8192);
	});

	test('ignores unrelated ssh and tar diagnostics', () => {
		assert.strictEqual(parseDirectTarProgressBytes('ssh: connect to host 192.168.9.64 port 22 failed\ntar: exiting with failure status 2'), undefined);
	});
});
