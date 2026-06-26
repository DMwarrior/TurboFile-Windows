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

		assert.ok(plan.command.length < 600, `expected compact command, got ${plan.command.length} chars`);
		assert.ok(plan.command.includes('xargs -0'), plan.command);
		assert.ok(plan.command.includes('cp -a'), plan.command);
		assert.ok(!plan.command.includes(items[0].sourcePath), 'source paths must be streamed through stdin');
		assert.strictEqual(plan.input[plan.input.length - 1], 0);
		assert.strictEqual(plan.input.toString('utf8').split('\0').filter(Boolean).length, items.length);
	});

	test('builds a stdin-driven POSIX move command', () => {
		const plan = createPosixNativeBatchTransferPlan([
			{ sourcePath: '/tmp/source/a.txt', targetName: 'a.txt', sourceType: 'file' },
			{ sourcePath: '/tmp/source/b.txt', targetName: 'b.txt', sourceType: 'file' }
		], '/tmp/target', 'move');

		assert.ok(plan.command.includes('xargs -0'), plan.command);
		assert.ok(plan.command.includes('mv -f'), plan.command);
		assert.deepStrictEqual(plan.input.toString('utf8').split('\0'), ['/tmp/source/a.txt', '/tmp/source/b.txt', '']);
	});
});
