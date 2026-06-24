/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { createLocalBatchTarPlans, createTarNullListBuffer } from '../../common/turbofileBatchTarPlan.js';

suite('TurboFileBatchTarPlan', function () {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps same-parent selections in one tar plan', () => {
		const plans = createLocalBatchTarPlans([
			{ sourcePath: 'D:\\Work\\test\\images\\a.png', targetName: 'a.png', sourceType: 'file' },
			{ sourcePath: 'D:\\Work\\test\\images\\b.png', targetName: 'b.png', sourceType: 'file' }
		]);

		assert.deepStrictEqual(plans, [
			{
				parentPath: 'D:\\Work\\test\\images',
				names: ['a.png', 'b.png'],
				targetNames: ['a.png', 'b.png']
			}
		]);
	});

	test('groups cross-parent selections into multiple tar plans with flattened targets', () => {
		const plans = createLocalBatchTarPlans([
			{ sourcePath: 'D:\\Work\\test\\images\\a.png', targetName: 'a.png', sourceType: 'file' },
			{ sourcePath: 'D:\\Work\\test\\detect\\b.png', targetName: 'b.png', sourceType: 'file' },
			{ sourcePath: 'D:\\Work\\test\\images\\c.png', targetName: 'c.png', sourceType: 'file' }
		]);

		assert.deepStrictEqual(plans, [
			{
				parentPath: 'D:\\Work\\test\\images',
				names: ['a.png', 'c.png'],
				targetNames: ['a.png', 'c.png']
			},
			{
				parentPath: 'D:\\Work\\test\\detect',
				names: ['b.png'],
				targetNames: ['b.png']
			}
		]);
	});

	test('keeps folders as top-level target names', () => {
		const plans = createLocalBatchTarPlans([
			{ sourcePath: 'D:\\Work\\test\\1024x40', targetName: '1024x40', sourceType: 'directory' },
			{ sourcePath: 'D:\\Work\\test\\images', targetName: 'images', sourceType: 'directory' }
		]);

		assert.deepStrictEqual(plans, [
			{
				parentPath: 'D:\\Work\\test',
				names: ['1024x40', 'images'],
				targetNames: ['1024x40', 'images']
			}
		]);
	});

	test('marks non-ascii Windows parents for a safe tar root alias', () => {
		const plans = createLocalBatchTarPlans([
			{ sourcePath: 'D:\\Download\\测试目录\\a.png', targetName: 'a.png', sourceType: 'file' },
			{ sourcePath: 'D:\\Download\\测试目录\\b.png', targetName: 'b.png', sourceType: 'file' }
		]);

		assert.deepStrictEqual(plans, [
			{
				parentPath: 'D:\\Download\\测试目录',
				names: ['a.png', 'b.png'],
				targetNames: ['a.png', 'b.png'],
				requiresSafeParentPath: true
			}
		]);
	});

	test('rejects duplicate flattened target names', () => {
		assert.throws(() => createLocalBatchTarPlans([
			{ sourcePath: 'D:\\Work\\test\\images\\same.png', targetName: 'same.png', sourceType: 'file' },
			{ sourcePath: 'D:\\Work\\test\\detect\\same.png', targetName: 'same.png', sourceType: 'file' }
		]), /Duplicate target name in batch tar transfer: same\.png/);
	});

	test('creates null-delimited list input for large full-directory selections', () => {
		const names = Array.from({ length: 715 }, (_, index) => `202506201400${String(index).padStart(6, '0')}.bmp`);
		const buffer = createTarNullListBuffer(names);

		assert.strictEqual(buffer[buffer.length - 1], 0);
		assert.strictEqual(buffer.toString('utf8').split('\0').filter(Boolean).length, 715);
		assert.ok(buffer.length > names.join(' ').length);
	});
});
