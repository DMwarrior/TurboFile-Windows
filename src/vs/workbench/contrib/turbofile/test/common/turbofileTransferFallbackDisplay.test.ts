/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as sinon from 'sinon';
import * as ts from 'typescript';
import { localize } from '../../../../../nls.js';
import { ITurboFileTransferProgressEvent } from '../../../../../platform/turbofile/common/turbofile.js';
import { chooseDisplayTransferSpeed, isTurboFileTransferProgressQuiet, resolveTurboFileVisibleTotalBytes, shouldStartTransferTiming } from '../../common/turbofileTransferDisplay.js';
import { createTurboFileTransferProgressSemanticKey } from '../../common/turbofileTransferRefresh.js';

interface ITestTask {
	id: number;
	kind: 'transfer';
	label: string;
	detail: string;
	status: 'running' | 'success';
	progressId: string;
	startedAt: number;
	progress: number;
	trackTotalBytes: false;
	strategy?: string;
	transferFallbacks?: Array<{ previousStrategy: string | undefined; nextStrategy: string | undefined; reason: string }>;
}

class TestElement {
	readonly children: TestElement[] = [];
	readonly dataset: Record<string, string> = {};
	readonly classList = { add: (_className: string) => { } };
	textContent = '';
	title = '';

	appendChild(child: TestElement): TestElement {
		this.children.push(child);
		return child;
	}

	append(child: TestElement | string): void {
		if (typeof child === 'string') {
			this.textContent += child;
		} else {
			this.children.push(child);
		}
	}
}

interface IEditorHarness {
	paints: string[];
	updateTransferProgress(task: ITestTask, event: ITurboFileTransferProgressEvent): void;
	formatTransferProgressDetail(event: ITurboFileTransferProgressEvent, bytes: number, total: number | undefined): string;
	getTransferProtocolLabel(strategy: string | undefined): string | undefined;
	getTransferProtocolTooltip(task: ITestTask): string;
	getTransferFallbackDetail(task: ITestTask): string | undefined;
	finishTask(task: ITestTask, status: 'success', detail: string, options: { bytes: number; strategy: string }, shouldRender: false): void;
	renderTaskRow(task: ITestTask): TestElement;
}

/** Exercise persisted fallback state and the real tooltip, task-row and progress formatting paths. */
function createEditorHarness(): IEditorHarness {
	const editorPath = path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts');
	const source = ts.createSourceFile(editorPath, fs.readFileSync(editorPath, 'utf8'), ts.ScriptTarget.Latest, true);
	const names = new Set(['updateTransferProgress', 'formatTransferProgressDetail', 'getTransferStrategyFromProgress', 'getTransferProtocolLabel', 'getTransferProtocolTooltip', 'getTransferFallbackDetail', 'finishTask', 'renderTaskRow']);
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
		activePage = 'transfer';
		paints = [];
		transferMetricsDisplay = { advance() {} };
		calculateTransferSpeed() { return 100; }
		resetTransferSpeedSample() { return 100; }
		getLiveTransferAggregate(tasks) { const task = tasks[0]; return { transferredBytes: task.transferredBytes, totalBytes: task.totalBytes, speedBytesPerSecond: task.speedBytesPerSecond }; }
		updateLiveTransferTicker() { }
		updateInputRunningTaskCount() { }
		refreshTaskbar() { this.paints.push('taskbar'); }
		refreshTaskbarMetrics() { this.paints.push('metrics'); }
		refreshVisibleTaskLogEntry() { this.paints.push('log'); }
		refreshTaskLogMetrics() { this.paints.push('logMetrics'); }
		render() { this.paints.push('render'); }
		getTaskIcon() { return {}; }
		getTaskMetrics() { return ''; }
		${methods.join('\n')}
	}`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
	const Harness: new () => IEditorHarness = new Function('localize', 'formatSize', 'chooseDisplayTransferSpeed', 'isTurboFileTransferProgressQuiet', 'resolveTurboFileVisibleTotalBytes', 'shouldStartTransferTiming', 'createTurboFileTransferProgressSemanticKey', '$', 'renderIcon', `${code}; return Harness;`)(
		localize, (bytes: number) => `${bytes} B`, chooseDisplayTransferSpeed, isTurboFileTransferProgressQuiet, resolveTurboFileVisibleTotalBytes, shouldStartTransferTiming, createTurboFileTransferProgressSemanticKey, () => new TestElement(), () => new TestElement()
	);
	return new Harness();
}

function createTask(strategy: string | undefined = 'tar-direct'): ITestTask {
	return { id: 1, kind: 'transfer', label: 'files', detail: 'running', status: 'running', progressId: 'fixture', startedAt: Date.now(), progress: 8, trackTotalBytes: false, strategy };
}

function progress(overrides: Partial<ITurboFileTransferProgressEvent> = {}): ITurboFileTransferProgressEvent {
	return { progressId: 'fixture', phase: 'transfer', state: 'transferring', transferredBytes: 0, totalBytes: 0, strategy: 'sftp-direct', detail: 'SFTP transfer.', ...overrides };
}

suite('TurboFileTransferFallbackDisplay', () => {
	let clock: sinon.SinonFakeTimers;
	setup(() => clock = sinon.useFakeTimers({ now: 1000 }));
	teardown(() => clock.restore());

	test('real fallback formatting includes the failure cause', () => {
		const editor = createEditorHarness();
		const detail = editor.formatTransferProgressDetail(progress({ state: 'fallback', detail: 'tar: Permission denied; falling back to sftp direct.' }), 0, undefined);
		assert.strictEqual(detail, '协议回退：tar: Permission denied; falling back to sftp direct.');
	});

	test('the protocol transition and cause survive subsequent progress and successful completion', () => {
		const editor = createEditorHarness();
		const task = createTask();
		const reason = 'tar: Permission denied; falling back to sftp direct.';
		editor.updateTransferProgress(task, progress({ state: 'fallback', detail: reason }));
		clock.tick(50);
		editor.updateTransferProgress(task, progress({ transferredBytes: 100 }));
		editor.finishTask(task, 'success', 'finished', { bytes: 100, strategy: 'sftp-direct' }, false);
		const rowDetail = editor.renderTaskRow(task).children[1];
		assert.deepStrictEqual({ records: task.transferFallbacks, tooltip: editor.getTransferProtocolTooltip(task), rowDetail: rowDetail.textContent, rowTooltip: rowDetail.title }, {
			records: [{ previousStrategy: 'tar-direct', nextStrategy: 'sftp-direct', reason }],
			tooltip: `传输模式\ntar 直连 → sftp 直连：${reason}`,
			rowDetail: `finished\ntar 直连 → sftp 直连：${reason}`,
			rowTooltip: `finished\ntar 直连 → sftp 直连：${reason}`
		});
	});

	test('replayed fallback events do not duplicate history and later transitions remain visible', () => {
		const editor = createEditorHarness();
		const task = createTask();
		const first = progress({ state: 'fallback', detail: 'tar unavailable' });
		editor.updateTransferProgress(task, first);
		editor.updateTransferProgress(task, first);
		editor.updateTransferProgress(task, progress({ state: 'fallback', strategy: 'tar-relay', detail: 'direct connection closed' }));
		assert.deepStrictEqual(task.transferFallbacks, [
			{ previousStrategy: 'tar-direct', nextStrategy: 'sftp-direct', reason: 'tar unavailable' },
			{ previousStrategy: 'sftp-direct', nextStrategy: 'tar-relay', reason: 'direct connection closed' }
		]);
	});

	test('ordinary byte updates add no renders, timers or fallback history', () => {
		const editor = createEditorHarness();
		const task = createTask('sftp-direct');
		editor.updateTransferProgress(task, progress({ transferredBytes: 1 }));
		editor.paints.length = 0;
		for (let bytes = 2; bytes < 10; bytes++) {
			clock.tick(25);
			editor.updateTransferProgress(task, progress({ transferredBytes: bytes }));
		}
		assert.deepStrictEqual({ paints: editor.paints, timers: clock.countTimers(), fallbacks: task.transferFallbacks, tooltip: editor.getTransferProtocolTooltip(task) }, { paints: [], timers: 0, fallbacks: undefined, tooltip: '传输模式' });
	});

	test('a first actual SFTP event without an earlier Tar attempt never invents a fallback', () => {
		const editor = createEditorHarness();
		const task = createTask();
		task.strategy = undefined;
		editor.updateTransferProgress(task, progress({ phase: 'prepare', state: 'preparing', strategy: undefined, detail: 'Preparing batch transfer.' }));
		const before = editor.getTransferProtocolLabel(task.strategy);
		editor.updateTransferProgress(task, progress());
		assert.deepStrictEqual({ before, after: editor.getTransferProtocolLabel(task.strategy), fallbacks: task.transferFallbacks }, { before: undefined, after: 'sftp 直连', fallbacks: undefined });
	});
});
