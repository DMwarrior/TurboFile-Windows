/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import { localize } from '../../../../../nls.js';

interface ITestTask {
	id: number;
	kind: 'transfer';
	status: 'running' | 'canceled' | 'success' | 'error';
	cancelRequested: boolean;
	progressId?: string;
	label: string;
	detail: string;
	error?: string;
}

interface ITestItem {
	name: string;
	path: string;
	rawSize: number;
}

interface ITestDevice {
	id: string;
	name: string;
}

interface ICancelResult {
	ok: boolean;
	message: string;
}

interface ITransferResult extends ICancelResult {
	bytes: number;
	canceled?: boolean;
}

interface IEditorHarness {
	tasks: ITestTask[];
	devices: Record<'left' | 'right', ITestDevice>;
	endpointGate: Promise<void>;
	endpointWaiters: number;
	disposedSubscriptions: number;
	fileSpawned: number;
	batchSpawned: number;
	renames: Array<{ source: string; target: string; progressId: string }>;
	directoryMoves: Array<{ paths: string[]; target: string; progressId: string }>;
	runningTaskCount: number;
	cancelCalls: string[];
	sshService: { cancelTransfer(progressId: string): Promise<ICancelResult>; transferFile(): Promise<ITransferResult>; renamePath(source: { path: string }, target: string, options: { progressId: string }): Promise<ICancelResult> };
	cancelTask(task: ITestTask): Promise<void>;
	cancelRunningTransfers(tasks: readonly ITestTask[]): Promise<void>;
	cancelRunningTasksForClose(): Promise<void>;
	transferItem(sourceSide: 'left', targetSide: 'right', item: ITestItem, options: { refreshTarget: boolean; task: ITestTask }): Promise<ITransferResult>;
	transferItemsBatch(sourceSide: 'left', targetSide: 'right', sourceDevice: ITestDevice, targetDevice: ITestDevice, items: ITestItem[], operation: 'copy'): Promise<boolean>;
	renameTransferItem(task: ITestTask, device: ITestDevice, source: string, target: string): Promise<ICancelResult & { canceled?: boolean }>;
	moveSelectedItemsIntoDirectory(side: 'left', target: string, label: string): Promise<void>;
}

/** Exercise cancellation and transfer entry points with the real methods and deferred credentials. */
function createEditorHarness(): IEditorHarness {
	const editorPath = path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts');
	const source = ts.createSourceFile(editorPath, fs.readFileSync(editorPath, 'utf8'), ts.ScriptTarget.Latest, true);
	const names = new Set(['cancelTask', 'cancelRunningTransfers', 'cancelRunningTasksForClose', 'transferItem', 'transferItemsBatch', 'createTransferContext', 'renameTransferItem', 'moveSelectedItemsIntoDirectory']);
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
		tasks = [];
		devices = { left: { id: '62', name: '62' }, right: { id: '64', name: '64' } };
		paneStates = { left: { path: '/source' }, right: { path: '/target' } };
		endpointGate = Promise.resolve();
		endpointWaiters = 0;
		disposedSubscriptions = 0;
		fileSpawned = 0;
		batchSpawned = 0;
		renames = [];
		directoryMoves = [];
		runningTaskCount = 0;
		cancelCalls = [];
		sshService = {
			cancelTransfer: async id => { this.cancelCalls.push(id); return { ok: true, message: 'canceled' }; },
			onDynamicTransferProgress: () => () => ({ dispose: () => this.disposedSubscriptions++ }),
			transferFile: async () => { this.fileSpawned++; return { ok: false, canceled: true, message: 'canceled', bytes: 0 }; },
			transferBatch: async () => { this.batchSpawned++; return { ok: false, canceled: true, message: 'canceled', bytes: 0, completed: 0, failed: 0, failures: [] }; },
			renamePath: async (source, target, options) => { this.renames.push({ source: source.path, target, progressId: options.progressId }); return { ok: true, message: 'moved' }; },
			movePathsIntoDirectory: async (sources, target, options) => { this.directoryMoves.push({ paths: sources.map(source => source.path), target, progressId: options.progressId }); return { ok: true, message: 'moved' }; }
		};
		getPaneDevice(side) { return this.devices[side]; }
		isWindowsDevice() { return false; }
		getDirectoryMoveTargets() { return [{ name: 'a', path: '/source/a', rawSize: 1 }]; }
		async getSshConnectionOptions() { return {}; }
		async removeMovedTrashMetadata() { return []; }
		applyOptimisticTransferResult() { }
		async toTransferEndpoint(_device, path) { this.endpointWaiters++; await this.endpointGate; return { path }; }
		getPlannedTransferStrategy() { return 'scp-direct'; }
		getPlannedBatchTransferStrategy() { return 'tar-direct'; }
		shouldDeferSshToSshStrategy() { return false; }
		createTransferTaskItem(item) { return { name: item.name, status: 'waiting', totalBytes: item.rawSize, transferredBytes: 0 }; }
		primeTransferTaskStrategy() { }
		beginTask(_kind, label, detail) { const task = { id: this.tasks.length + 1, progressId: 'task-' + (this.tasks.length + 1), kind: 'transfer', status: 'running', cancelRequested: false, label, detail, progress: 0 }; this.tasks.push(task); return task; }
		finishTask(task, status, detail) { task.status = status; task.detail = detail; }
		updateTask(task, detail, progress) { task.detail = detail; task.progress = progress; }
		render() { }
		prewarmCurrentTransferPair() { }
		schedulePostTransferReconcile() { }
		updateInputRunningTaskCount() { this.runningTaskCount = this.tasks.filter(task => task.status === 'running').length; }
		${methods.join('\n')}
	}`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
	const Harness: new () => IEditorHarness = new Function('localize', 'joinPanePath', 'LOCAL_WINDOWS_DEVICE_ID', `${code}; return Harness;`)(localize, (directory: string, name: string) => `${directory}/${name}`, 'local-windows');
	return new Harness();
}

function createTask(id = 1): ITestTask {
	return { id, kind: 'transfer', status: 'running', cancelRequested: false, progressId: `task-${id}`, label: 'files', detail: 'running' };
}

suite('TurboFileTransferCancellation', () => {
	test('canceling a single transfer while credentials wait prevents spawning the transfer', async () => {
		const editor = createEditorHarness();
		let releaseCredentials!: () => void;
		editor.endpointGate = new Promise<void>(resolve => releaseCredentials = resolve);
		const task = createTask();
		const transfer = editor.transferItem('left', 'right', { name: 'a', path: '/source/a', rawSize: 1 }, { refreshTarget: false, task });
		assert.strictEqual(editor.endpointWaiters, 2);
		await editor.cancelTask(task);
		releaseCredentials();
		const result = await transfer;
		assert.deepStrictEqual({ canceled: result.canceled, spawned: editor.fileSpawned, status: task.status, subscriptionsDisposed: editor.disposedSubscriptions }, { canceled: true, spawned: 0, status: 'canceled', subscriptionsDisposed: 1 });
	});

	test('canceling a batch while credentials wait prevents spawning the transfer', async () => {
		const editor = createEditorHarness();
		let releaseCredentials!: () => void;
		editor.endpointGate = new Promise<void>(resolve => releaseCredentials = resolve);
		const transfer = editor.transferItemsBatch('left', 'right', editor.devices.left, editor.devices.right, [{ name: 'a', path: '/source/a', rawSize: 1 }], 'copy');
		assert.strictEqual(editor.endpointWaiters, 2);
		await editor.cancelTask(editor.tasks[0]);
		releaseCredentials();
		const ok = await transfer;
		assert.deepStrictEqual({ ok, spawned: editor.batchSpawned, status: editor.tasks[0].status, subscriptionsDisposed: editor.disposedSubscriptions }, { ok: false, spawned: 0, status: 'canceled', subscriptionsDisposed: 1 });
	});

	test('canceling native cut while credentials wait prevents rename and disposes its subscription', async () => {
		const editor = createEditorHarness();
		let release!: () => void;
		editor.endpointGate = new Promise<void>(resolve => release = resolve);
		const task = createTask();
		const rename = editor.renameTransferItem(task, editor.devices.left, '/source/a', '/target/a');
		await editor.cancelTask(task);
		release();
		const result = await rename;
		assert.deepStrictEqual({ canceled: result.canceled, renames: editor.renames, disposed: editor.disposedSubscriptions, status: task.status }, { canceled: true, renames: [], disposed: 1, status: 'canceled' });
	});

	test('native cut preserves the exact rename target and releases progress listeners on success or failure', async () => {
		const editor = createEditorHarness();
		const task = createTask();
		await editor.renameTransferItem(task, editor.devices.left, '/source/a', '/target/a');
		editor.sshService.renamePath = async () => { throw new Error('move failed'); };
		await assert.rejects(editor.renameTransferItem(task, editor.devices.left, '/source/b', '/target/b'), /move failed/);
		assert.deepStrictEqual({ routes: editor.renames.map(rename => ({ source: rename.source, target: rename.target, progress: !!rename.progressId })), disposed: editor.disposedSubscriptions }, { routes: [{ source: '/source/a', target: '/target/a', progress: true }], disposed: 2 });
	});

	test('same-pane folder moves keep the original batch move API and dispose their progress subscription', async () => {
		const editor = createEditorHarness();
		await editor.moveSelectedItemsIntoDirectory('left', '/target', 'target');
		assert.deepStrictEqual({ moves: editor.directoryMoves, transferBatchCalls: editor.batchSpawned, disposed: editor.disposedSubscriptions, status: editor.tasks[0].status }, {
			moves: [{ paths: ['/source/a'], target: '/target', progressId: 'task-1' }], transferBatchCalls: 0, disposed: 1, status: 'success'
		});
	});

	test('same-pane folder moves cannot start after cancellation while endpoints are resolving', async () => {
		const editor = createEditorHarness();
		let release!: () => void;
		editor.endpointGate = new Promise<void>(resolve => release = resolve);
		const move = editor.moveSelectedItemsIntoDirectory('left', '/target', 'target');
		await editor.cancelTask(editor.tasks[0]);
		release();
		await move;
		assert.deepStrictEqual({ moves: editor.directoryMoves, disposed: editor.disposedSubscriptions, status: editor.tasks[0].status }, { moves: [], disposed: 1, status: 'canceled' });
	});

	test('a blocked first cancellation cannot stop later tasks from receiving cancellation', async () => {
		const editor = createEditorHarness();
		const first = createTask(1);
		const second = createTask(2);
		let releaseFirst!: (result: ICancelResult) => void;
		const firstReply = new Promise<ICancelResult>(resolve => releaseFirst = resolve);
		editor.sshService.cancelTransfer = async id => {
			editor.cancelCalls.push(id);
			return id === first.progressId ? firstReply : { ok: true, message: 'canceled' };
		};
		const cancel = editor.cancelRunningTransfers([first, second]);
		try {
			await Promise.resolve();
			await Promise.resolve();
			assert.deepStrictEqual({ calls: editor.cancelCalls, firstStatus: first.status, secondStatus: second.status }, { calls: ['task-1', 'task-2'], firstStatus: 'running', secondStatus: 'canceled' });
		} finally {
			releaseFirst({ ok: true, message: 'canceled' });
			await cancel;
		}
	});

	test('a rejected cancellation keeps the task running, reports the cause and permits retry', async () => {
		const editor = createEditorHarness();
		const task = createTask();
		editor.sshService.cancelTransfer = async () => { throw new Error('IPC disconnected'); };
		await editor.cancelTask(task);
		assert.deepStrictEqual({ status: task.status, requested: task.cancelRequested, error: task.error, detail: task.detail }, { status: 'running', requested: false, error: 'IPC disconnected', detail: '取消任务失败：IPC disconnected' });
		editor.sshService.cancelTransfer = async () => ({ ok: true, message: 'canceled' });
		await editor.cancelTask(task);
		assert.strictEqual(task.status, 'canceled');
	});

	test('a failed cancellation response never claims that the running transfer stopped', async () => {
		const editor = createEditorHarness();
		const task = createTask();
		editor.sshService.cancelTransfer = async () => ({ ok: false, message: 'channel still active' });
		await editor.cancelTask(task);
		assert.deepStrictEqual({ status: task.status, requested: task.cancelRequested, error: task.error }, { status: 'running', requested: false, error: 'channel still active' });
	});

	test('an already terminal task cannot reopen credential prompts or start a transfer', async () => {
		const editor = createEditorHarness();
		const task = createTask();
		task.status = 'canceled';
		const result = await editor.transferItem('left', 'right', { name: 'a', path: '/source/a', rawSize: 1 }, { refreshTarget: false, task });
		assert.deepStrictEqual({ canceled: result.canceled, credentials: editor.endpointWaiters, spawned: editor.fileSpawned }, { canceled: true, credentials: 0, spawned: 0 });
	});

	test('closing a page preserves a failed cancellation and permits a successful retry', async () => {
		const editor = createEditorHarness();
		const task = createTask();
		editor.tasks.push(task);
		editor.sshService.cancelTransfer = async () => ({ ok: false, message: 'SSH channel still running' });
		await assert.rejects(editor.cancelRunningTasksForClose(), /files: SSH channel still running/);
		assert.deepStrictEqual({ status: task.status, requested: task.cancelRequested, runningTaskCount: editor.runningTaskCount }, { status: 'running', requested: false, runningTaskCount: 1 });
		editor.sshService.cancelTransfer = async () => ({ ok: true, message: 'canceled' });
		await editor.cancelRunningTasksForClose();
		assert.deepStrictEqual({ status: task.status, runningTaskCount: editor.runningTaskCount }, { status: 'canceled', runningTaskCount: 0 });
	});
});
