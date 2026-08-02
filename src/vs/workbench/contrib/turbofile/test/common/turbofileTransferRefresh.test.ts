/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { applyTurboFileOptimisticTransfer, createTurboFilePostTransferRefreshPlan, createTurboFileTransferProgressSemanticKey } from '../../common/turbofileTransferRefresh.js';

interface TestItem {
	readonly name: string;
	readonly path: string;
}

suite('TurboFileTransferRefresh', () => {
	test('copy refreshes only the target pane', () => {
		assert.deepStrictEqual(createTurboFilePostTransferRefreshPlan('copy', 'left', 'right'), ['right']);
	});

	test('cross-pane move refreshes source and target', () => {
		assert.deepStrictEqual(createTurboFilePostTransferRefreshPlan('move', 'left', 'right'), ['left', 'right']);
	});

	test('same-pane move refreshes the pane once', () => {
		assert.deepStrictEqual(createTurboFilePostTransferRefreshPlan('move', 'left', 'left'), ['left']);
	});

	test('refreshes every visible alias of the captured transfer locations', () => {
		assert.deepStrictEqual(createTurboFilePostTransferRefreshPlan('copy', [], ['left', 'right']), ['left', 'right']);
		assert.deepStrictEqual(createTurboFilePostTransferRefreshPlan('move', ['right'], ['left', 'right']), ['right', 'left']);
	});

	test('copy preserves the source and replaces target conflicts in place', () => {
		const sourceItems: TestItem[] = [
			{ name: '..', path: '/source/..' },
			{ name: 'one.png', path: '/source/one.png' },
			{ name: 'two.png', path: '/source/two.png' }
		];
		const targetItems: TestItem[] = [
			{ name: '..', path: '/target/..' },
			{ name: 'one.png', path: '/target/one.png' },
			{ name: 'keep.png', path: '/target/keep.png' }
		];

		const result = applyTurboFileOptimisticTransfer('copy', sourceItems, targetItems, [
			{ sourceKey: '/source/one.png', targetKey: '/target/one.png', targetItem: { name: 'one.png', path: '/target/one.png' } },
			{ sourceKey: '/source/two.png', targetKey: '/target/two.png', targetItem: { name: 'two.png', path: '/target/two.png' } }
		], false);

		assert.deepStrictEqual(result, {
			sourceItems,
			targetItems: [
				{ name: '..', path: '/target/..' },
				{ name: 'one.png', path: '/target/one.png' },
				{ name: 'keep.png', path: '/target/keep.png' },
				{ name: 'two.png', path: '/target/two.png' }
			]
		});
	});

	test('cross-pane move removes only transferred sources and inserts targets', () => {
		const result = applyTurboFileOptimisticTransfer('move', [
			{ name: '..', path: '/source/..' },
			{ name: 'moved', path: '/source/moved' },
			{ name: 'untouched', path: '/source/untouched' }
		], [
			{ name: '..', path: '/target/..' }
		], [
			{ sourceKey: '/source/moved', targetKey: '/target/moved', targetItem: { name: 'moved', path: '/target/moved' } }
		], false);

		assert.deepStrictEqual(result, {
			sourceItems: [
				{ name: '..', path: '/source/..' },
				{ name: 'untouched', path: '/source/untouched' }
			],
			targetItems: [
				{ name: '..', path: '/target/..' },
				{ name: 'moved', path: '/target/moved' }
			]
		});
	});

	test('same-pane move removes the old path before inserting the new path', () => {
		const items: TestItem[] = [
			{ name: '..', path: '/work/..' },
			{ name: 'old', path: '/work/old' },
			{ name: 'new', path: '/work/new' }
		];
		const result = applyTurboFileOptimisticTransfer('move', items, items, [
			{ sourceKey: '/work/old', targetKey: '/work/new', targetItem: { name: 'new', path: '/work/new' } }
		], true);

		assert.deepStrictEqual(result, {
			sourceItems: [
				{ name: '..', path: '/work/..' },
				{ name: 'new', path: '/work/new' }
			],
			targetItems: [
				{ name: '..', path: '/work/..' },
				{ name: 'new', path: '/work/new' }
			]
		});
	});

	test('progress semantics change immediately when route or strategy changes', () => {
		const queued = createTurboFileTransferProgressSemanticKey({ phase: 'prepare', state: 'running', currentName: 'tiny.png' });
		const direct = createTurboFileTransferProgressSemanticKey({ phase: 'prepare', state: 'running', strategy: 'scp-direct', route: 'source-push', currentName: 'tiny.png' });
		const relay = createTurboFileTransferProgressSemanticKey({ phase: 'prepare', state: 'running', strategy: 'scp-relay', route: 'relay', currentName: 'tiny.png' });

		assert.deepStrictEqual({ queuedVsDirect: queued === direct, directVsRelay: direct === relay }, { queuedVsDirect: false, directVsRelay: false });
	});

	test('progress semantic key stays stable across byte and rsync counter updates', () => {
		const firstState = { phase: 'rsync-direct', state: 'running', strategy: 'rsync-direct', route: 'source-push', currentName: 'tiny.png', transferredBytes: 1024, toCheck: 20, transferIndex: 1 };
		const nextState = { phase: 'rsync-direct', state: 'running', strategy: 'rsync-direct', route: 'source-push', currentName: 'tiny.png', transferredBytes: 8192, toCheck: 19, transferIndex: 2 };
		const first = createTurboFileTransferProgressSemanticKey(firstState);
		const next = createTurboFileTransferProgressSemanticKey(nextState);

		assert.strictEqual(first, next);
	});
});
