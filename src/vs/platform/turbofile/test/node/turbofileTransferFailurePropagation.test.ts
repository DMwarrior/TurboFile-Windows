/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import { ITurboFileBatchTransferRequest, ITurboFileBatchTransferResult, ITurboFileTransferProgressEvent, ITurboFileTransferRequest, ITurboFileTransferResult } from '../../common/turbofile.js';
import { TurboFileDirectDataError } from '../../common/turbofileDirectRoute.js';
import { getTurboFileTransferErrorMessage } from '../../common/turbofileTransferFailure.js';
import { TurboFileRemoteCancellationError } from '../../common/turbofileRemoteProcessControl.js';

interface IHarness {
	readonly transferProgressSnapshots: Map<string, { lastAt: number; lastBytes: number; strategy: string; completedItems?: number }>;
	readonly events: Partial<ITurboFileTransferProgressEvent>[];
	transferFile(request: ITurboFileTransferRequest): Promise<ITurboFileTransferResult>;
	transferBatch(request: ITurboFileBatchTransferRequest): Promise<ITurboFileBatchTransferResult>;
}

/** Replays public service error boundaries, including their actual batch result builder. */
function harness(error: Error): IHarness {
	const file = path.join(process.cwd(), 'src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts');
	const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
	const names = new Set(['transferFile', 'transferBatch', 'createBatchTransferResult']);
	const methods: string[] = [];
	const visit = (node: ts.Node): void => {
		if (ts.isMethodDeclaration(node) && names.has(node.name.getText(source))) {
			methods.push(node.getText(source));
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
	assert.strictEqual(methods.length, names.size);
	const code = ts.transpileModule(`class Harness {
		transferProgressSnapshots = new Map(); transferCancellationRequests = new Set(); transferCancelHandlers = new Map(); events = [];
		async transferFileCore() { throw failure; } async transferBatchCore() { throw failure; }
		isTransferCanceled() { return false; } recordTransferSchedulingResult() {} recordTransferSchedulingFailure() {}
		scheduleTransferProgressCleanup() {} getTransferDurationMs() { return 0; }
		fireTransferProgress(request, bytes, total, phase, detail, force, extra) { this.events.push({ transferredBytes: bytes, detail, ...extra }); }
		${methods.join('\n')}
	}`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
	class CanceledError extends Error { }
	const Harness: new () => IHarness = new Function('failure', 'getTransferStrategy', 'getBatchTransferSchedulingSnapshot', 'formatTransferError', 'TurboFileTransferCanceledError', 'TRANSFER_CANCELED_MESSAGE', 'TurboFileRemoteCancellationError', `${code}; return Harness;`)(
		error.name === 'TurboFileTransferCanceledError' ? new CanceledError(error.message) : error,
		() => 'scp-direct', () => ({ workerLimit: 2 }), getTurboFileTransferErrorMessage, CanceledError, 'Transfer canceled.', TurboFileRemoteCancellationError
	);
	return new Harness();
}

const endpoints = { source: { kind: 'local' as const, path: '/source' }, target: { kind: 'local' as const, path: '/target' } };

suite('TurboFileTransferFailurePropagation', () => {
	test('an unconfirmed remote stop is reported as failure rather than a successful cancellation', async () => {
		const error = new TurboFileRemoteCancellationError();
		const service = harness(error);
		const result = await service.transferFile({ ...endpoints, progressId: 'unconfirmed' });
		assert.strictEqual(result.message, error.message);
		assert.ok(!result.canceled);
		assert.strictEqual(service.events.at(-1)?.state, 'failed');
	});
	test('public file result retains the permission path and the actual active protocol', async () => {
		const message = 'tar: /source/locked.pyc: Permission denied';
		const service = harness(new TurboFileDirectDataError('source-push', [{ route: 'source-push', stage: 'initial' }], new Error(message)));
		service.transferProgressSnapshots.set('file', { lastAt: 0, lastBytes: 42, strategy: 'tar-direct' });
		const result = await service.transferFile({ ...endpoints, progressId: 'file' });
		assert.deepStrictEqual({ message: result.message, strategy: result.strategy, bytes: result.bytes, state: service.events.at(-1)?.state }, {
			message, strategy: 'tar-direct', bytes: 42, state: 'failed'
		});
	});

	test('public batch result retains confirmed item progress when a later item fails', async () => {
		const message = 'scp: /source/second: Permission denied';
		const service = harness(new TurboFileDirectDataError('source-push', [{ route: 'source-push', stage: 'initial' }], new Error(message)));
		service.transferProgressSnapshots.set('batch', { lastAt: 0, lastBytes: 42, strategy: 'sftp-direct', completedItems: 1 });
		const result = await service.transferBatch({ source: endpoints.source, targetDirectory: endpoints.target, progressId: 'batch',
			items: [{ sourcePath: '/source/first', targetName: 'first' }, { sourcePath: '/source/second', targetName: 'second' }] });
		assert.deepStrictEqual({ message: result.message, strategy: result.strategy, bytes: result.bytes, completed: result.completed, failed: result.failed }, {
			message, strategy: 'sftp-direct', bytes: 42, completed: 1, failed: 1
		});
	});

	test('a canceled transport remains canceled after its active handler has been released', async () => {
		const error = new Error('Transfer canceled.');
		error.name = 'TurboFileTransferCanceledError';
		const service = harness(error);
		const result = await service.transferFile({ ...endpoints, progressId: 'canceled' });
		assert.deepStrictEqual({ ok: result.ok, canceled: result.canceled, state: service.events.at(-1)?.state }, { ok: false, canceled: true, state: 'canceled' });
	});
});
