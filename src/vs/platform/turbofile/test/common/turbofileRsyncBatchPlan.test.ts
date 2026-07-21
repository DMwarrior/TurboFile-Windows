/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { createTurboFileRsyncMappedGroups, createTurboFileRsyncSourceGroups } from '../../common/turbofileRsyncBatchPlan.js';

suite('TurboFileRsyncBatchPlan', () => {
	test('groups POSIX sources by parent while preserving basenames', () => {
		assert.deepStrictEqual(createTurboFileRsyncSourceGroups([
			'/srv/a/one file.png',
			'/srv/b/two\nlines.png',
			'/srv/a/three.png'
		], 'posix'), [
			{ sourceBase: '/srv/a', relativePaths: ['one file.png', 'three.png'] },
			{ sourceBase: '/srv/b', relativePaths: ['two\nlines.png'] }
		]);
	});

	test('groups Windows sources case-insensitively without changing names', () => {
		assert.deepStrictEqual(createTurboFileRsyncSourceGroups([
			'C:\\Data\\A.txt',
			'c:\\data\\B.txt',
			'D:\\Other\\C.txt'
		], 'windows'), [
			{ sourceBase: 'C:\\Data', relativePaths: ['A.txt', 'B.txt'] },
			{ sourceBase: 'D:\\Other', relativePaths: ['C.txt'] }
		]);
	});

	test('rejects roots and nul-containing paths', () => {
		assert.throws(() => createTurboFileRsyncSourceGroups(['/'], 'posix'));
		assert.throws(() => createTurboFileRsyncSourceGroups(['/srv/a\0bad'], 'posix'));
	});

	test('combines reverse rsync mappings only when basenames stay unchanged', () => {
		assert.deepStrictEqual(createTurboFileRsyncMappedGroups([
			{ sourcePath: '/cygdrive/d/data/a.png', targetPath: '/srv/out/a.png' },
			{ sourcePath: '/cygdrive/d/data/b.png', targetPath: '/srv/out/b.png' },
			{ sourcePath: '/cygdrive/d/data/c.png', targetPath: '/srv/renamed.png' }
		]), {
			groups: [{
				sourceBase: '/cygdrive/d/data',
				targetBase: '/srv/out',
				relativePaths: ['a.png', 'b.png']
			}],
			direct: [{ sourcePath: '/cygdrive/d/data/c.png', targetPath: '/srv/renamed.png' }]
		});
	});

	test('collapses ten thousand same-directory reverse mappings into one rsync process group', () => {
		const mappings = Array.from({ length: 10_000 }, (_, index) => {
			const name = `${String(index).padStart(5, '0')}_图像 -- "样本".png`;
			return {
				sourcePath: `/cygdrive/d/data/${name}`,
				targetPath: `/srv/out/${name}`
			};
		});

		const plan = createTurboFileRsyncMappedGroups(mappings);

		assert.strictEqual(plan.groups.length, 1);
		assert.strictEqual(plan.groups[0].relativePaths.length, mappings.length);
		assert.strictEqual(plan.direct.length, 0);
	});
});
