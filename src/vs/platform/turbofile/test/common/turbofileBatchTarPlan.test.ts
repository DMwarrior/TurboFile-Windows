/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { createLocalBatchTarPlans, createRemoteBatchTarSourcePlan, createTarNullListBuffer, isTurboFileBatchCommandSafe } from '../../common/turbofileBatchTarPlan.js';

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
				targetNames: ['a.png', 'b.png'],
				fileNames: ['a.png', 'b.png'],
				directoryNames: [],
				unknownNames: []
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
				targetNames: ['a.png', 'c.png'],
				fileNames: ['a.png', 'c.png'],
				directoryNames: [],
				unknownNames: []
			},
			{
				parentPath: 'D:\\Work\\test\\detect',
				names: ['b.png'],
				targetNames: ['b.png'],
				fileNames: ['b.png'],
				directoryNames: [],
				unknownNames: []
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
				targetNames: ['1024x40', 'images'],
				fileNames: [],
				directoryNames: ['1024x40', 'images'],
				unknownNames: [],
				containsDirectories: true
			}
		]);
	});

	test('marks only plans that contain directories for recursive discovery', () => {
		const plans = createLocalBatchTarPlans([
			{ sourcePath: 'D:\\Work\\files\\a.png', targetName: 'a.png', sourceType: 'file' },
			{ sourcePath: 'D:\\Work\\folders\\images', targetName: 'images', sourceType: 'directory' }
		]);

		assert.strictEqual(plans?.[0].containsDirectories, undefined);
		assert.strictEqual(plans?.[1].containsDirectories, true);
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
				fileNames: ['a.png', 'b.png'],
				directoryNames: [],
				unknownNames: [],
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

	test('classifies a ten-thousand-file mixed selection without losing the one directory', () => {
		const files = Array.from({ length: 10_000 }, (_, index) => ({
			sourcePath: `D:\\Work\\test\\images\\${String(index).padStart(5, '0')}.png`,
			targetName: `${String(index).padStart(5, '0')}.png`,
			sourceType: 'file' as const
		}));
		const plans = createLocalBatchTarPlans([
			...files,
			{ sourcePath: 'D:\\Work\\test\\images\\nested', targetName: 'nested', sourceType: 'directory' }
		]);

		assert.strictEqual(plans?.length, 1);
		assert.strictEqual(plans[0].names.length, 10_001);
		assert.strictEqual(plans[0].fileNames.length, 10_000);
		assert.deepStrictEqual(plans[0].directoryNames, ['nested']);
		assert.deepStrictEqual(plans[0].unknownNames, []);
		assert.strictEqual(plans[0].containsDirectories, true);
	});

	test('keeps missing and unknown source types in the unknown list', () => {
		const plans = createLocalBatchTarPlans([
			{ sourcePath: 'D:\\Work\\test\\mystery-a', targetName: 'mystery-a' },
			{ sourcePath: 'D:\\Work\\test\\mystery-b', targetName: 'mystery-b', sourceType: 'unknown' }
		]);

		assert.deepStrictEqual(plans, [{
			parentPath: 'D:\\Work\\test',
			names: ['mystery-a', 'mystery-b'],
			targetNames: ['mystery-a', 'mystery-b'],
			fileNames: [],
			directoryNames: [],
			unknownNames: ['mystery-a', 'mystery-b']
		}]);
	});

	test('creates null-delimited list input for large full-directory selections', () => {
		const names = Array.from({ length: 715 }, (_, index) => `202506201400${String(index).padStart(6, '0')}.bmp`);
		const buffer = createTarNullListBuffer(names);

		assert.strictEqual(buffer[buffer.length - 1], 0);
		assert.strictEqual(new TextDecoder().decode(buffer).split('\0').filter(Boolean).length, 715);
		assert.ok(buffer.length > names.join(' ').length);
	});

	test('rejects NUL characters in every tar manifest entry position', () => {
		assert.throws(() => createTarNullListBuffer(['bad\0name', 'ok']), /cannot contain NUL/);
		assert.throws(() => createTarNullListBuffer(['ok', 'bad\0name']), /cannot contain NUL/);
		assert.strictEqual(createTarNullListBuffer([]).byteLength, 0);
	});

	test('keeps small remote tar selections on the inline fast path', () => {
		const names = ['a.png', 'b c.png', "d'e.png"];
		const plan = createRemoteBatchTarSourcePlan('/home/ubuntu/data', names);

		assert.strictEqual(plan.input, undefined);
		assert.ok(plan.command.includes('tar -cf -'));
		assert.ok(plan.command.includes("'b c.png'"));
		assert.ok(isTurboFileBatchCommandSafe(plan.command));
	});

	test('streams the 6172-item reproduction through a compact null-delimited manifest', () => {
		const names = Array.from({ length: 6172 }, (_, index) => `202606190023${String(index).padStart(8, '0')}_TH23061_M.png`);
		const plan = createRemoteBatchTarSourcePlan('/home/th/work/Qingwei_Autotrain/data/TuoShuiShuCai/classifier_train/caigan', names);

		assert.ok(plan.input);
		assert.ok(plan.command.includes('--null -T -'));
		assert.ok(plan.command.length < 1024, `expected compact command, got ${plan.command.length} chars`);
		assert.ok(!plan.command.includes(names[0]));
		assert.strictEqual(new TextDecoder().decode(plan.input).split('\0').filter(Boolean).length, names.length);
	});

	test('preserves one hundred thousand special-character names in the manifest', () => {
		const names = Array.from({ length: 100_000 }, (_, index) => `中文 空格 ' ${String(index).padStart(8, '0')}.png`);
		const plan = createRemoteBatchTarSourcePlan('/home/ubuntu/极限目录', names);

		assert.ok(plan.input);
		const decoded = new TextDecoder().decode(plan.input).split('\0');
		assert.strictEqual(decoded.length, names.length + 1);
		assert.strictEqual(decoded[0], names[0]);
		assert.strictEqual(decoded[names.length - 1], names[names.length - 1]);
		assert.strictEqual(decoded[names.length], '');
	});
});
