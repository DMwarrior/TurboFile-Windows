/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { TurboFileDirectoryPrefetchQueue } from '../../common/turbofileDirectoryPrefetchQueue.js';

suite('TurboFileDirectoryPrefetchQueue', () => {
	test('limits background directory prefetches so foreground navigation is not starved', async () => {
		const queue = new TurboFileDirectoryPrefetchQueue(1);
		let active = 0;
		let maxActive = 0;
		const releases: Array<() => void> = [];

		const createTask = () => async () => {
			active++;
			maxActive = Math.max(maxActive, active);
			await new Promise<void>(resolve => releases.push(resolve));
			active--;
		};

		queue.enqueue('a', createTask());
		queue.enqueue('b', createTask());
		queue.enqueue('c', createTask());

		await tick();
		assert.strictEqual(active, 1);
		assert.strictEqual(maxActive, 1);

		releases.shift()?.();
		await tick();
		assert.strictEqual(active, 1);
		assert.strictEqual(maxActive, 1);

		releases.shift()?.();
		await tick();
		assert.strictEqual(active, 1);
		assert.strictEqual(maxActive, 1);

		releases.shift()?.();
		await queue.whenIdle();
		assert.strictEqual(active, 0);
		assert.strictEqual(maxActive, 1);
	});

	test('drops duplicate queued prefetches for the same directory', async () => {
		const queue = new TurboFileDirectoryPrefetchQueue(1);
		let runs = 0;

		queue.enqueue('same', async () => { runs++; });
		queue.enqueue('same', async () => { runs++; });
		await queue.whenIdle();

		assert.strictEqual(runs, 1);
	});

	test('prioritize runs the hovered directory next, ahead of the queued backlog', async () => {
		const queue = new TurboFileDirectoryPrefetchQueue(1);
		const order: string[] = [];
		const releases: Array<() => void> = [];

		const createTask = (key: string) => async () => {
			order.push(key);
			await new Promise<void>(resolve => releases.push(resolve));
		};

		// 'a' starts immediately (concurrency 1); 'b' and 'c' wait in the queue.
		queue.enqueue('a', createTask('a'));
		queue.enqueue('b', createTask('b'));
		queue.enqueue('c', createTask('c'));
		await tick();

		// The user hovers 'c' while 'a' is still running: it should jump ahead of 'b'.
		queue.prioritize('c');

		releases.shift()?.(); // finish 'a'
		await tick();
		releases.shift()?.(); // finish 'c'
		await tick();
		releases.shift()?.(); // finish 'b'
		await queue.whenIdle();

		assert.deepStrictEqual(order, ['a', 'c', 'b']);
	});
});

async function tick(): Promise<void> {
	await new Promise(resolve => setTimeout(resolve, 0));
}
