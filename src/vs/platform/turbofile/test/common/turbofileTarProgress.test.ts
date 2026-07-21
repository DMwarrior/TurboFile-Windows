/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { parseDirectTarProgressBytes } from '../../common/turbofileTarProgress.js';

suite('TurboFileTarProgress', () => {
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
