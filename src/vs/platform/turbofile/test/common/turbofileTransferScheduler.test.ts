/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ITurboFileTransferEndpoint } from '../../common/turbofile.js';
import { TurboFileTransferScheduler, getTurboFileTransferBatchPathKeys, getTurboFileTransferPathKey } from '../../common/turbofileTransferScheduler.js';

suite('TurboFileTransferScheduler', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const ssh = (path: string, port = 22): ITurboFileTransferEndpoint => ({
		kind: 'ssh',
		path,
		connection: { host: '10.0.0.1', port, username: 'user', password: 'secret' }
	});

	test('normalizes paths into stable parent lock keys', () => {
		assert.strictEqual(getTurboFileTransferPathKey(ssh('/data/a/file.txt'), 'parent'), 'path:ssh:user@10.0.0.1:22|/data/a');
		assert.strictEqual(getTurboFileTransferPathKey({ kind: 'local', path: 'D:\\Work\\a\\file.txt' }, 'parent'), 'path:local|d:/work/a');
		assert.strictEqual(getTurboFileTransferPathKey(ssh('/a'), 'parent'), 'path:ssh:user@10.0.0.1:22|/');
	});

	test('locks every source in small batches and bounds large batch claims', () => {
		assert.deepStrictEqual(getTurboFileTransferBatchPathKeys(ssh('/data/a.txt'), ['/data/a.txt', '/data/b.txt']), [
			'path:ssh:user@10.0.0.1:22|/data/a.txt',
			'path:ssh:user@10.0.0.1:22|/data/b.txt'
		]);
		const manyPaths = Array.from({ length: 10_000 }, (_, index) => `/data/images/${index}.png`);
		assert.deepStrictEqual(getTurboFileTransferBatchPathKeys(ssh(manyPaths[0]), manyPaths), [
			'path:ssh:user@10.0.0.1:22|/data/images'
		]);
	});

	test('starts shared storage conservatively without reducing a single stream', () => {
		const scheduler = new TurboFileTransferScheduler();
		assert.deepStrictEqual(scheduler.getBatchLimits(ssh('/volume1/data', 8000)), { files: 8, directories: 2 });
		assert.deepStrictEqual(scheduler.getBatchLimits(ssh('/home/user/data')), { files: 16, directories: 4 });
	});

	test('keeps shared-storage classification stable for a device across paths', () => {
		const scheduler = new TurboFileTransferScheduler();
		assert.deepStrictEqual(scheduler.getBatchLimits(ssh('/home/user/data', 8000)), { files: 16, directories: 4 });
		assert.deepStrictEqual(scheduler.getBatchLimits(ssh('/volume1/data', 8000)), { files: 8, directories: 2 });
		assert.deepStrictEqual(scheduler.getBatchLimits(ssh('/home/user/again', 8000)), { files: 8, directories: 2 });
	});

	test('uses file capacity for files and directory capacity for directories', () => {
		const scheduler = new TurboFileTransferScheduler();
		assert.strictEqual(scheduler.getDeviceCapacity(ssh('/home/user/file.bin'), 'file'), 16);
		assert.strictEqual(scheduler.getDeviceCapacity(ssh('/home/user/folder'), 'directory'), 4);
		assert.strictEqual(scheduler.getDeviceCapacity(ssh('/volume1/file.bin', 8000), 'file'), 8);
	});

	test('reduces concurrency after resource failures and recovers after successes', () => {
		const scheduler = new TurboFileTransferScheduler();
		const endpoint = ssh('/home/user/data');
		scheduler.recordResult(endpoint, { category: 'network-transient', retryable: true, reduceConcurrency: true });
		assert.deepStrictEqual(scheduler.getBatchLimits(endpoint), { files: 8, directories: 2 });
		for (let index = 0; index < 4; index++) {
			scheduler.recordSuccess(endpoint);
		}
		assert.deepStrictEqual(scheduler.getBatchLimits(endpoint), { files: 9, directories: 3 });
	});
});
