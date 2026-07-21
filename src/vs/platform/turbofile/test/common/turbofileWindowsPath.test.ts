/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { normalizeWindowsTransferPaths } from '../../common/turbofileWindowsPath.js';

suite('TurboFileWindowsPath', () => {
	test('deduplicates Windows short and long names after realpath resolution', async () => {
		const paths = await normalizeWindowsTransferPaths([
			'C:\\Users\\me\\Desktop\\BAOYU_~1',
			'C:\\Users\\me\\Desktop\\BaoYu_1344_8_0_3_2'
		], async path => path.includes('BAOYU_~1')
			? 'C:\\Users\\me\\Desktop\\BaoYu_1344_8_0_3_2'
			: path);

		assert.deepStrictEqual(paths, ['C:\\Users\\me\\Desktop\\BaoYu_1344_8_0_3_2']);
	});

	test('keeps the original path when realpath is unavailable', async () => {
		const paths = await normalizeWindowsTransferPaths([
			'C:\\Users\\me\\Desktop\\missing'
		], async () => {
			throw new Error('not found');
		});

		assert.deepStrictEqual(paths, ['C:\\Users\\me\\Desktop\\missing']);
	});

	test('resolves very large Explorer selections concurrently with a fixed upper bound', async () => {
		const inputs = Array.from({ length: 100 }, (_, index) => `C:\\Data\\${String(index).padStart(3, '0')}.png`);
		let active = 0;
		let maximumActive = 0;
		const paths = await normalizeWindowsTransferPaths(inputs, async path => {
			active++;
			maximumActive = Math.max(maximumActive, active);
			await new Promise<void>(resolve => setTimeout(resolve, 1));
			active--;
			return path;
		});

		assert.deepStrictEqual(paths, inputs);
		assert.strictEqual(maximumActive, 16);
	});
});
