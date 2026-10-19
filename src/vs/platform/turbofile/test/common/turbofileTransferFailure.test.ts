/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TurboFileDirectDataError, TurboFileDirectUnavailableError } from '../../common/turbofileDirectRoute.js';
import { classifyTurboFileTransferFailure, getTurboFileTransferErrorMessage, getTurboFileTransferProtocolName, getTurboFileTransferProgressState, shouldContinueTurboFileTransferPlan } from '../../common/turbofileTransferFailure.js';

suite('TurboFileTransferFailure', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('classifies terminal failures without fallback', () => {
		for (const [message, category] of [
			['Authentication failed', 'authentication'],
			['Permission denied', 'permission'],
			['scp: /home/th/Work/fankun/code/retrieve/pytorch/configs/__pycache__/model_selection.cpython-38.pyc: Permission denied', 'permission'],
			['tar: pytorch/configs/__pycache__/model_selection.cpython-38.pyc：无法 open: 权限不够', 'permission'],
			['EROFS: read-only file system', 'permission'],
			['Target already exists', 'conflict'],
			['cp: source and destination are the same file', 'conflict'],
			['rm: cannot remove small.txt: Is a directory', 'conflict'],
			['scp: dest/item: Not a directory', 'conflict'],
			['无法删除 small.txt: 是一个目录', 'conflict'],
			['无法打开 dest/item: 不是目录', 'conflict'],
			['ENOENT: no such file or directory, open source.txt', 'path-unavailable'],
			['Path not found', 'path-unavailable'],
			['tar: data.bin：文件在我们读入之前被删除了', 'path-unavailable'],
			['tar: data.bin: file changed as we read it', 'source-changed'],
			['tar: data.bin: 在我们读入文件时文件发生了变化', 'source-changed'],
			['ENOSPC: no space left on device', 'no-space'],
			['TURBOFILE_SCP_COMMIT_FAILED: remote target commit failed', 'integrity'],
			['Transfer canceled', 'canceled']
		] as const) {
			const failure = classifyTurboFileTransferFailure(new Error(message));
			assert.strictEqual(failure.category, category);
			assert.strictEqual(shouldContinueTurboFileTransferPlan(failure), false);
			assert.strictEqual(failure.reduceConcurrency, false);
		}
	});

	test('classifies safe fallback failures', () => {
		for (const error of [
			new TurboFileDirectUnavailableError([]),
			new Error('scp: command not found'),
			new Error('bash: No such file or directory'),
			new Error('connect ETIMEDOUT'),
			new Error('client_loop: send disconnect: Broken pipe'),
			new Error('Transferred size mismatch')
		]) {
			assert.strictEqual(shouldContinueTurboFileTransferPlan(classifyTurboFileTransferFailure(error)), true);
		}
	});

	test('preserves a terminal cause wrapped by a direct route data error', () => {
		const failure = classifyTurboFileTransferFailure(new TurboFileDirectDataError('source-push', [], new Error('Permission denied')));
		assert.deepStrictEqual(failure, { category: 'permission', retryable: false, reduceConcurrency: false });
	});

	test('missing native executables permit fallback but missing transfer paths remain terminal', () => {
		const missingTool = { code: 'ENOENT', syscall: 'spawn tar.exe' };
		const recoverable = [
			Object.assign(new Error('spawn tar.exe ENOENT'), missingTool),
			{ name: 'Error', message: 'Native tool unavailable', ...missingTool },
			new Error('Native tar upload failed: spawn C:\\Program Files\\OpenSSH\\ssh.exe ENOENT'),
			'spawn tar.exe ENOENT',
			'spawnSync zstd.exe ENOENT'
		];
		const terminal = [
			Object.assign(new Error('ENOENT: no such file or directory, open source.txt'), { code: 'ENOENT', syscall: 'open' }),
			{ name: 'Error', message: 'ENOENT: no such file or directory, stat source', code: 'ENOENT', syscall: 'stat' },
			'ENOENT: no such file or directory, open spawn tar.exe ENOENT',
			new Error('tar: source: Cannot stat: No such file or directory')
		];
		assert.deepStrictEqual([...recoverable, ...terminal].map(classifyTurboFileTransferFailure), [
			...recoverable.map(() => ({ category: 'protocol-unavailable', retryable: true, reduceConcurrency: false })),
			...terminal.map(() => ({ category: 'path-unavailable', retryable: false, reduceConcurrency: false }))
		]);
	});

	test('preserves the actual cause category instead of treating every direct error as integrity failure', () => {
		const cases = [
			{ message: 'connect ETIMEDOUT', category: 'network-transient', retryable: true, reduceConcurrency: true },
			{ message: 'tar: command not found', category: 'protocol-unavailable', retryable: true, reduceConcurrency: false },
			{ message: 'scp: unexpected response', category: 'unknown', retryable: true, reduceConcurrency: false },
			{ message: 'rm: cannot remove small.txt: Is a directory', category: 'conflict', retryable: false, reduceConcurrency: false },
			{ message: 'tar: pytorch/configs/__pycache__/model_selection.cpython-38.pyc：无法 open: 权限不够', category: 'permission', retryable: false, reduceConcurrency: false },
			{ message: 'tar: data.bin: 在我们读入文件时文件发生了变化', category: 'source-changed', retryable: false, reduceConcurrency: false },
			{ message: 'Permission denied (publickey,password).', category: 'authentication', retryable: false, reduceConcurrency: false }
		] as const;
		const actual = cases.map(testCase => classifyTurboFileTransferFailure(new TurboFileDirectDataError('source-push', [{ route: 'source-push', stage: 'initial' }], new Error(testCase.message))));
		assert.deepStrictEqual(actual, cases.map(({ category, retryable, reduceConcurrency }) => ({ category, retryable, reduceConcurrency })));
	});

	test('maps strategy and phase to stable public names', () => {
		assert.strictEqual(getTurboFileTransferProtocolName('scp-direct'), 'scp');
		assert.strictEqual(getTurboFileTransferProtocolName('local-copy'), 'native');
		assert.strictEqual(getTurboFileTransferProgressState('prepare'), 'preparing');
		assert.strictEqual(getTurboFileTransferProgressState('relay-upload'), 'transferring');
		assert.strictEqual(getTurboFileTransferProgressState('complete'), 'completed');
	});

	test('reports underlying diagnostics through nested direct route errors', () => {
		const diagnostic = 'rm: cannot remove /destination/item: Is a directory';
		const unavailable = new TurboFileDirectUnavailableError([], new Error(diagnostic));
		const data = new TurboFileDirectDataError('source-push', [], unavailable);
		assert.deepStrictEqual([
			getTurboFileTransferErrorMessage(data),
			getTurboFileTransferErrorMessage(unavailable),
			getTurboFileTransferErrorMessage(new Error(diagnostic)),
			getTurboFileTransferErrorMessage(diagnostic),
			getTurboFileTransferErrorMessage(new TurboFileDirectDataError('source-push', []))
		], [diagnostic, diagnostic, diagnostic, diagnostic, 'The direct SSH transfer failed.']);
	});

	test('handles transported error metadata and protects against cyclic causes', () => {
		const cyclic: { name: string; message: string; transferCause?: object } = { name: 'TurboFileDirectDataError', message: 'Cyclic diagnostic' };
		cyclic.transferCause = cyclic;
		assert.deepStrictEqual([
			getTurboFileTransferErrorMessage({ name: 'TurboFileDirectDataError', message: 'Wrapped', transferCause: { name: 'Error', message: 'Underlying diagnostic' } }),
			getTurboFileTransferErrorMessage(cyclic)
		], ['Underlying diagnostic', 'Cyclic diagnostic']);
	});
});
