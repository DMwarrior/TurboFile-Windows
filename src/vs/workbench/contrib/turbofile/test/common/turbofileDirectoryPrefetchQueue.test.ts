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
});

async function tick(): Promise<void> {
	await new Promise(resolve => setTimeout(resolve, 0));
}
