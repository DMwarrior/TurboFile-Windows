/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { suite, test } from 'node:test';
import * as preLaunch from '../preLaunch.ts';

suite('preLaunch', () => {
	test('exposes compiled output validation', () => {
		assert.ok('hasCompiledEntryPoint' in preLaunch);
	});

	test('requires the main process entry point instead of only the output directory', async () => {
		const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'turbofile-prelaunch-'));
		try {
			await fs.mkdir(path.join(directory, 'out'));
			const directoryOnly = await preLaunch.hasCompiledEntryPoint(directory);

			await fs.writeFile(path.join(directory, 'out', 'main.js'), '');
			const entryPointPresent = await preLaunch.hasCompiledEntryPoint(directory);

			assert.deepStrictEqual([directoryOnly, entryPointPresent], [false, true]);
		} finally {
			await fs.rm(directory, { recursive: true, force: true });
		}
	});
});
