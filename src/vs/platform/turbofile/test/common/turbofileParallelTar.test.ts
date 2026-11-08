/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { getTurboFileTarParentDirectories, runTurboFileParallelTarTasks } from '../../common/turbofileParallelTar.js';

suite('TurboFileParallelTar', () => {
	test('prepares shared ancestors across files assigned to different streams', () => {
		assert.deepStrictEqual(getTurboFileTarParentDirectories([
			'images/day1/a.png', 'images/day1/b.png', 'labels/day1/a.txt', 'labels/day2/b.txt', 'root.txt'
		]), ['images', 'images/day1', 'labels', 'labels/day1', 'labels/day2']);
	});

	test('retains literal unicode, spaces, newlines and shell characters in directory names', () => {
		assert.deepStrictEqual(getTurboFileTarParentDirectories([
			'混合文件/line\nbreak/a.txt', "混合文件/'$name;/b.txt", '-leading/file.txt'
		]), ['-leading', '混合文件', "混合文件/'$name;", '混合文件/line\nbreak']);
	});

	test('prepares the parents of empty directory entries without inventing file directories', () => {
		assert.deepStrictEqual(getTurboFileTarParentDirectories(['empty/nested', 'file.txt', 'empty2']), ['empty']);
		assert.deepStrictEqual(getTurboFileTarParentDirectories([]), []);
	});

	test('waits for running writers and stops queued tasks after a failure', async () => {
		const expectedError = new Error('extract failed');
		const started: number[] = [];
		let fail: () => void = () => undefined;
		let finishWriter: () => void = () => undefined;
		let stopped = false;
		let settled = false;
		const transfer = runTurboFileParallelTarTasks([0, 1, 2], 2, async (item, shouldStop) => {
			started.push(item);
			if (item === 0) {
				await new Promise<void>((_, reject) => fail = () => reject(expectedError));
			} else {
				await new Promise<void>(resolve => finishWriter = resolve);
				stopped = shouldStop();
			}
		});
		void transfer.then(() => settled = true, () => settled = true);
		fail();
		await Promise.resolve();
		await Promise.resolve();
		assert.strictEqual(settled, false);
		finishWriter();
		await assert.rejects(transfer, error => error === expectedError);
		assert.deepStrictEqual({ started, stopped }, { started: [0, 1], stopped: true });
	});

	test('runs every chunk when all workers complete', async () => {
		const completed: number[] = [];
		await runTurboFileParallelTarTasks([0, 1, 2, 3], 2, async item => { completed.push(item); });
		assert.deepStrictEqual(completed.sort(), [0, 1, 2, 3]);
	});
});
