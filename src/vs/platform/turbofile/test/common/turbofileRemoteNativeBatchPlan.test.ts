/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { createPosixNativeBatchTransferPlan } from '../../common/turbofileRemoteNativeBatchPlan.js';

suite('TurboFileRemoteNativeBatchPlan', function () {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps large same-remote POSIX copy selections out of the exec command line', () => {
		const items = Array.from({ length: 2527 }, (_, index) => {
			const name = `202606250105${String(index).padStart(6, '0')}_T_TH23061.png`;
			return {
				sourcePath: `/home/ubuntu/work/Qingwei_Autotrain/data/xiaomai/small_images/BrokenTip/${name}`,
				targetName: name,
				sourceType: 'file' as const
			};
		});

		const plan = createPosixNativeBatchTransferPlan(items, '/home/ubuntu/work/fankun/test/11', 'copy');

		assert.ok(plan.command.length < 5000, `expected compact command, got ${plan.command.length} chars`);
		assert.ok(plan.command.includes('read -r -d'), plan.command);
		assert.ok(plan.command.includes('sources+=("$source")'), plan.command);
		assert.ok(plan.command.includes('chunk_size=128'), plan.command);
		assert.ok(plan.command.includes('copy_args=(-a -n)'), plan.command);
		assert.ok(!plan.command.includes(items[0].sourcePath), 'source paths must be streamed through stdin');
		assert.strictEqual(plan.input[plan.input.length - 1], 0);
		assert.strictEqual(new TextDecoder().decode(plan.input).split('\0').filter(Boolean).length, items.length * 3);
	});

	test('builds a stdin-driven POSIX move command', () => {
		const plan = createPosixNativeBatchTransferPlan([
			{ sourcePath: '/tmp/source/a.txt', targetName: 'a.txt', sourceType: 'file' },
			{ sourcePath: '/tmp/source/b.txt', targetName: 'b.txt', sourceType: 'file' }
		], '/tmp/target', 'move');

		assert.ok(plan.command.includes('read -r -d'), plan.command);
		assert.ok(plan.command.includes('mv -n'), plan.command);
		assert.ok(plan.command.includes('[ ! -e "$source" ] && [ ! -L "$source" ]'), plan.command);
		assert.ok(!plan.command.includes('mv -f'), plan.command);
		assert.deepStrictEqual(new TextDecoder().decode(plan.input).split('\0'), [
			'/tmp/source/a.txt',
			'a.txt',
			'file',
			'/tmp/source/b.txt',
			'b.txt',
			'file',
			''
		]);
	});

	test('preserves conflict-generated target names outside the basename batch fast path', () => {
		const plan = createPosixNativeBatchTransferPlan([
			{ sourcePath: '/tmp/source/a.txt', targetName: 'a (1).txt', sourceType: 'file' }
		], '/tmp/target', 'move');

		assert.ok(plan.command.includes('read -r -d'), plan.command);
		assert.ok(plan.command.includes('dst="$target/$name"'), plan.command);
		assert.ok(plan.command.includes('[ -e "$dst" ] || [ -L "$dst" ]'), plan.command);
		assert.ok(!plan.command.includes('mv -f'), plan.command);
		assert.ok(!plan.command.includes('/tmp/source/a.txt'), 'source paths must remain on stdin');
		assert.deepStrictEqual(new TextDecoder().decode(plan.input).split('\0'), [
			'/tmp/source/a.txt',
			'a (1).txt',
			'file',
			''
		]);
	});

	test('rejects duplicate targets and nul-delimited path corruption before execution', () => {
		assert.throws(() => createPosixNativeBatchTransferPlan([
			{ sourcePath: '/tmp/source/a.txt', targetName: 'same.txt', sourceType: 'file' },
			{ sourcePath: '/tmp/source/b.txt', targetName: 'same.txt', sourceType: 'file' }
		], '/tmp/target', 'move'), /Duplicate target names/);
		assert.throws(() => createPosixNativeBatchTransferPlan([
			{ sourcePath: '/tmp/source/a\0.txt', targetName: 'a.txt', sourceType: 'file' }
		], '/tmp/target', 'copy'), /NUL/);
	});
});
