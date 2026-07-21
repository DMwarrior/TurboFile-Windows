/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TurboFileOperationCanceledError, TurboFileOperationQueue } from '../../common/turbofileOperationQueue.js';

suite('TurboFileOperationQueue', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('serializes operations that share a device key', async () => {
		const queue = new TurboFileOperationQueue();
		const order: string[] = [];
		let releaseFirst!: () => void;
		const firstGate = new Promise<void>(resolve => releaseFirst = resolve);

		const first = queue.run(['ssh:user@host:22'], async () => {
			order.push('first-start');
			await firstGate;
			order.push('first-end');
		});
		const second = queue.run(['ssh:user@host:22'], async () => {
			order.push('second-start');
		});

		await Promise.resolve();
		assert.deepStrictEqual(order, ['first-start']);
		releaseFirst();
		await Promise.all([first, second]);
		assert.deepStrictEqual(order, ['first-start', 'first-end', 'second-start']);
	});

	test('runs operations on disjoint devices concurrently', async () => {
		const queue = new TurboFileOperationQueue();
		let started = 0;
		let release!: () => void;
		const gate = new Promise<void>(resolve => release = resolve);

		const left = queue.run(['ssh:left'], async () => { started++; await gate; });
		const right = queue.run(['ssh:right'], async () => { started++; await gate; });
		await Promise.resolve();
		assert.strictEqual(started, 2);
		release();
		await Promise.all([left, right]);
	});

	test('runs shared operations on the same device concurrently', async () => {
		const queue = new TurboFileOperationQueue();
		let started = 0;
		let release!: () => void;
		const gate = new Promise<void>(resolve => release = resolve);

		const first = queue.runShared(['ssh:shared'], async () => { started++; await gate; });
		const second = queue.runShared(['ssh:shared'], async () => { started++; await gate; });
		await Promise.resolve();
		assert.strictEqual(started, 2);
		release();
		await Promise.all([first, second]);
	});

	test('waits for active shared operations before starting a write', async () => {
		const queue = new TurboFileOperationQueue();
		const order: string[] = [];
		let releaseReaders!: () => void;
		const readerGate = new Promise<void>(resolve => releaseReaders = resolve);

		const firstReader = queue.runShared(['ssh:shared'], async () => { order.push('reader-1'); await readerGate; });
		const secondReader = queue.runShared(['ssh:shared'], async () => { order.push('reader-2'); await readerGate; });
		const writer = queue.run(['ssh:shared'], async () => { order.push('writer'); });
		await Promise.resolve();
		assert.deepStrictEqual(order, ['reader-1', 'reader-2']);
		releaseReaders();
		await Promise.all([firstReader, secondReader, writer]);
		assert.deepStrictEqual(order, ['reader-1', 'reader-2', 'writer']);
	});

	test('does not let a later shared operation overtake a waiting writer', async () => {
		const queue = new TurboFileOperationQueue();
		const order: string[] = [];
		let releaseFirstReader!: () => void;
		let releaseWriter!: () => void;
		const firstReaderGate = new Promise<void>(resolve => releaseFirstReader = resolve);
		const writerGate = new Promise<void>(resolve => releaseWriter = resolve);

		const firstReader = queue.runShared(['ssh:shared'], async () => { order.push('reader-1'); await firstReaderGate; });
		const writer = queue.run(['ssh:shared'], async () => { order.push('writer'); await writerGate; });
		const laterReader = queue.runShared(['ssh:shared'], async () => { order.push('reader-2'); });
		await Promise.resolve();
		assert.deepStrictEqual(order, ['reader-1']);
		releaseFirstReader();
		await firstReader;
		await Promise.resolve();
		assert.deepStrictEqual(order, ['reader-1', 'writer']);
		releaseWriter();
		await Promise.all([writer, laterReader]);
		assert.deepStrictEqual(order, ['reader-1', 'writer', 'reader-2']);
	});

	test('merges duplicate read and write keys into exclusive write access', async () => {
		const queue = new TurboFileOperationQueue();
		const order: string[] = [];
		let release!: () => void;
		const gate = new Promise<void>(resolve => release = resolve);

		const mixed = queue.runWithAccess({ read: ['ssh:shared'], write: ['ssh:shared'] }, async () => {
			order.push('mixed');
			await gate;
		});
		const reader = queue.runShared(['ssh:shared'], async () => { order.push('reader'); });
		await Promise.resolve();
		assert.deepStrictEqual(order, ['mixed']);
		release();
		await Promise.all([mixed, reader]);
		assert.deepStrictEqual(order, ['mixed', 'reader']);
	});

	test('acquires mixed multi-device access atomically without deadlock', async () => {
		const queue = new TurboFileOperationQueue();
		const order: string[] = [];
		let release!: () => void;
		const gate = new Promise<void>(resolve => release = resolve);

		const first = queue.runWithAccess({ read: ['ssh:b'], write: ['ssh:a'] }, async () => {
			order.push('first');
			await gate;
		});
		const second = queue.runWithAccess({ read: ['ssh:a'], write: ['ssh:b'] }, async () => { order.push('second'); });
		await Promise.resolve();
		assert.deepStrictEqual(order, ['first']);
		release();
		await Promise.all([first, second]);
		assert.deepStrictEqual(order, ['first', 'second']);
	});

	test('normalizes multi-device keys so opposite transfer directions cannot deadlock', async () => {
		const queue = new TurboFileOperationQueue();
		const order: string[] = [];
		let release!: () => void;
		const gate = new Promise<void>(resolve => release = resolve);

		const first = queue.run(['ssh:b', 'ssh:a', 'ssh:a'], async () => {
			order.push('first');
			await gate;
		});
		const second = queue.run(['ssh:a', 'ssh:b'], async () => order.push('second'));
		await Promise.resolve();
		assert.deepStrictEqual(order, ['first']);
		release();
		await Promise.all([first, second]);
		assert.deepStrictEqual(order, ['first', 'second']);
	});

	test('preserves FIFO order for queued operations sharing a key', async () => {
		const queue = new TurboFileOperationQueue();
		const order: number[] = [];
		let release!: () => void;
		const gate = new Promise<void>(resolve => release = resolve);

		const first = queue.run(['local'], async () => { order.push(1); await gate; });
		const second = queue.run(['local'], async () => { order.push(2); });
		const third = queue.run(['local'], async () => { order.push(3); });
		await Promise.resolve();
		release();
		await Promise.all([first, second, third]);
		assert.deepStrictEqual(order, [1, 2, 3]);
	});

	test('releases device keys after an operation rejects', async () => {
		const queue = new TurboFileOperationQueue();
		await assert.rejects(queue.run(['local'], async () => { throw new Error('failed'); }), /failed/);
		assert.strictEqual(await queue.run(['local'], async () => 42), 42);
	});

	test('releases shared access after a reader rejects', async () => {
		const queue = new TurboFileOperationQueue();
		await assert.rejects(queue.runShared(['local'], async () => { throw new Error('failed'); }), /failed/);
		assert.strictEqual(await queue.run(['local'], async () => 42), 42);
	});

	test('cancels a queued operation without starting it', async () => {
		const queue = new TurboFileOperationQueue();
		let release!: () => void;
		const gate = new Promise<void>(resolve => release = resolve);
		let secondStarted = false;

		const first = queue.run(['local'], async () => gate);
		const second = queue.run(['local'], async () => { secondStarted = true; }, { id: 'queued-operation' });
		assert.strictEqual(queue.cancel('queued-operation'), true);
		await assert.rejects(second, error => error instanceof TurboFileOperationCanceledError);
		assert.strictEqual(secondStarted, false);
		release();
		await first;
	});

	test('cancels a queued shared operation without affecting the active writer', async () => {
		const queue = new TurboFileOperationQueue();
		let release!: () => void;
		const gate = new Promise<void>(resolve => release = resolve);
		let readerStarted = false;

		const writer = queue.run(['local'], async () => gate);
		const reader = queue.runShared(['local'], async () => { readerStarted = true; }, { id: 'queued-reader' });
		assert.strictEqual(queue.cancel('queued-reader'), true);
		await assert.rejects(reader, error => error instanceof TurboFileOperationCanceledError);
		assert.strictEqual(readerStarted, false);
		release();
		await writer;
	});

	test('keeps draining when lifecycle observers throw', async () => {
		const queue = new TurboFileOperationQueue();
		let release!: () => void;
		const gate = new Promise<void>(resolve => release = resolve);
		const order: string[] = [];

		const first = queue.run(['local'], async () => { order.push('first'); await gate; }, {
			onStarted: () => { throw new Error('observer failed'); }
		});
		const second = queue.run(['local'], async () => { order.push('second'); }, {
			onQueued: () => { throw new Error('observer failed'); }
		});
		await Promise.resolve();
		assert.deepStrictEqual(order, ['first']);
		release();
		await Promise.all([first, second]);
		assert.deepStrictEqual(order, ['first', 'second']);
	});

	test('releases device keys before the completed operation promise settles', async () => {
		const queue = new TurboFileOperationQueue();
		await queue.run(['local'], async () => undefined);

		let queuedAfterAwait = false;
		await queue.run(['local'], async () => undefined, {
			onQueued: () => queuedAfterAwait = true
		});
		assert.strictEqual(queuedAfterAwait, false);
	});

	test('never overlaps device keys under a large mixed-key workload', async () => {
		const queue = new TurboFileOperationQueue();
		const activeKeys = new Set<string>();
		const tasks = Array.from({ length: 500 }, (_, index) => {
			const keys = index % 5 === 0
				? [`ssh:${index % 11}`, `ssh:${(index + 3) % 11}`]
				: [`ssh:${index % 11}`];
			return queue.run(keys, async () => {
				for (const key of keys) {
					assert.ok(!activeKeys.has(key), `overlapping operation on ${key}`);
					activeKeys.add(key);
				}
				await Promise.resolve();
				for (const key of keys) {
					activeKeys.delete(key);
				}
				return index;
			});
		});

		const results = await Promise.all(tasks);
		assert.strictEqual(results.length, 500);
		assert.strictEqual(activeKeys.size, 0);
	});

	test('preserves shared and exclusive access rules under a 500 operation workload', async () => {
		const queue = new TurboFileOperationQueue();
		const activeReaders = new Map<string, number>();
		const activeWriters = new Set<string>();
		const tasks = Array.from({ length: 500 }, (_, index) => {
			const key = `ssh:${index % 11}`;
			const shared = index % 3 !== 0;
			const operation = async () => {
				assert.ok(!activeWriters.has(key), `operation overlapped writer on ${key}`);
				if (shared) {
					activeReaders.set(key, (activeReaders.get(key) ?? 0) + 1);
				} else {
					assert.strictEqual(activeReaders.get(key) ?? 0, 0, `writer overlapped readers on ${key}`);
					activeWriters.add(key);
				}
				await Promise.resolve();
				if (shared) {
					activeReaders.set(key, (activeReaders.get(key) ?? 1) - 1);
				} else {
					activeWriters.delete(key);
				}
				return index;
			};
			return shared ? queue.runShared([key], operation) : queue.run([key], operation);
		});

		const results = await Promise.all(tasks);
		assert.deepStrictEqual([results.length, activeWriters.size, [...activeReaders.values()].reduce((sum, count) => sum + count, 0)], [500, 0, 0]);
	});
});
