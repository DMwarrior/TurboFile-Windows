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
import { aggregateTurboFileTransferProgress, chooseDisplayTransferSpeed, isTurboFileTransferProgressQuiet, resolveTurboFileVisibleTotalBytes, shouldStartTransferTiming, trimTurboFileTaskHistory, TurboFileTransferMetricsDisplay } from '../../common/turbofileTransferDisplay.js';
import { createTurboFileTransferProgressSemanticKey } from '../../common/turbofileTransferRefresh.js';

class TestElement {
	readonly children: TestElement[] = [];
	readonly classes = new Set<string>();
	readonly attributes = new Map<string, string>();
	readonly style = { width: '' };
	readonly listeners = new Map<string, () => void>();
	readonly classList = {
		add: (name: string): void => { this.classes.add(name); },
		toggle: (name: string, enabled: boolean): void => { if (enabled) { this.classes.add(name); } else { this.classes.delete(name); } }
	};
	parentElement: TestElement | undefined;
	textContent = '';
	title = '';
	disabled = false;

	constructor(selector = 'div') {
		selector.split('.').slice(1).forEach(name => this.classes.add(name));
	}

	setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
	removeAttribute(name: string): void { this.attributes.delete(name); }
	appendChild(child: TestElement): TestElement { child.parentElement = this; this.children.push(child); return child; }
	addEventListener(type: string, listener: (event: { stopPropagation(): void }) => void): void { this.listeners.set(type, () => listener({ stopPropagation() { } })); }
	replaceWith(next: TestElement): void {
		const siblings = this.parentElement?.children;
		if (siblings) {
			siblings.splice(siblings.indexOf(this), 1, next);
			next.parentElement = this.parentElement;
		}
	}
	querySelector(selector: string): TestElement | undefined { return this.querySelectorAll(selector)[0]; }
	querySelectorAll(selector: string): TestElement[] {
		const selectors = selector.split(' ');
		const matches = (element: TestElement, index: number): boolean => {
			const names = selectors[index].split('.').slice(1);
			if (!names.every(name => element.classes.has(name))) {
				return false;
			}
			if (index === 0) {
				return true;
			}
			for (let parent = element.parentElement; parent; parent = parent.parentElement) {
				if (matches(parent, index - 1)) {
					return true;
				}
			}
			return false;
		};
		const descendants = (element: TestElement): TestElement[] => element.children.flatMap(child => [child, ...descendants(child)]);
		return descendants(this).filter(element => matches(element, selectors.length - 1));
	}
}

interface ITestTask {
	status: 'running' | 'success' | 'error' | 'canceled';
	progress: number;
	cancelRequested?: boolean;
	progressId?: string;
	trackTotalBytes?: boolean;
}

interface IEditorHarness {
	container: TestElement;
	taskbarHiddenForTerminal: boolean;
	showTaskbar: boolean;
	renders: number;
	cancelCalls: ITestTask[][];
	useTaskMetrics: boolean;
	time: { text: string; title: string };
	summary: { transferredBytes: number; totalBytes?: number; speedBytesPerSecond: number };
	beginTask(kind: 'transfer', label: string, detail: string, shouldRender: false): ITestTask;
	finishTask(task: ITestTask, status: 'error' | 'canceled' | 'success', detail: string, options: object, shouldRender: false): void;
	refreshTaskbarMetrics(): void;
	updateTransferProgress(task: ITestTask, event: ITurboFileTransferProgressEvent): void;
}

/** Replay the real task-start and status-bar painters without importing the browser workbench. */
function createHarness(): IEditorHarness {
	const editorPath = path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts');
	const source = ts.createSourceFile(editorPath, fs.readFileSync(editorPath, 'utf8'), ts.ScriptTarget.Latest, true);
	const names = new Set(['beginTask', 'finishTask', 'getTaskStats', 'renderTaskbar', 'renderStatusbarItem', 'refreshTaskbar', 'refreshTaskbarMetrics', 'updateTransferProgress', 'getLiveTransferAggregate', 'calculateTransferSpeed', 'resetTransferSpeedSample', 'appendTransferSpeedSample', 'getSmoothedTransferSpeed']);
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
		container = new TestElement('.container');
		tasks = [];
		taskSequence = 1;
		activePage = 'transfer';
		taskbarHiddenForTerminal = true;
		showTaskbar = true;
		renders = 0;
		cancelCalls = [];
		useTaskMetrics = false;
		transferMetricsDisplay = new TurboFileTransferMetricsDisplay();
		time = { text: '12.5s', title: '已耗时' };
		postTransferReconcileGeneration = { left: 0, right: 0 };
		postTransferReconcileContexts = new Map();
		summary = { transferredBytes: 0, speedBytesPerSecond: 0 };
		constructor() { this.container.appendChild(new TestElement('.turbofile-transfer-page')); }
		shouldShowTaskbar() { return this.showTaskbar; }
		getLiveTransferDisplay(tasks) { return this.useTaskMetrics ? this.transferMetricsDisplay.read(tasks.map(task => task.id).join(','), this.getLiveTransferAggregate(tasks), Date.now()) : this.summary; }
		getLiveTransferStatusTitle() { return '正在传输'; }
		getTransferTimeDisplay() { return this.time; }
		getTransferStrategyFromProgress(event) { return event.strategy; }
		formatTransferProgressDetail(event) { return event.detail; }
		formatSpeed(bytes) { return bytes + ' B/s'; }
		getTransferProtocolLabel() { return '同机复制'; }
		getTransferProtocolTooltip() { return ''; }
		createIconButton(_icon, _label, selector) { return { element: new TestElement('.' + selector) }; }
		cancelRunningTransfers(tasks) { this.cancelCalls.push(tasks); }
		isTaskCancellable() { return true; }
		updateInputRunningTaskCount() { }
		updateLiveTransferTicker() { }
		refreshVisibleTaskLogEntry() { }
		formatTaskLine(task) { return task.status; }
		getTaskIcon() { return ''; }
		render() { this.renders++; }
		${methods.join('\n')}
	}`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
	const Harness: new () => IEditorHarness = new Function('TestElement', '$', 'localize', 'formatSize', 'renderIcon', 'Codicon', 'trimTurboFileTaskHistory', 'TurboFileTransferMetricsDisplay', 'aggregateTurboFileTransferProgress', 'chooseDisplayTransferSpeed', 'isTurboFileTransferProgressQuiet', 'resolveTurboFileVisibleTotalBytes', 'shouldStartTransferTiming', 'createTurboFileTransferProgressSemanticKey', `const TRANSFER_SPEED_SAMPLE_MIN_INTERVAL_MS = 500; const TRANSFER_SPEED_SAMPLE_MAX_COUNT = 8; ${code}; return Harness;`)(
		TestElement, (selector: string) => new TestElement(selector), localize, (bytes: number) => `${bytes} B`, () => new TestElement(), {}, trimTurboFileTaskHistory, TurboFileTransferMetricsDisplay, aggregateTurboFileTransferProgress, chooseDisplayTransferSpeed, isTurboFileTransferProgressQuiet, resolveTurboFileVisibleTotalBytes, shouldStartTransferTiming, createTurboFileTransferProgressSemanticKey
	);
	return new Harness();
}

function readMetrics(editor: IEditorHarness) {
	const values = editor.container.querySelectorAll('.turbofile-statusbar-section.is-right .turbofile-statusbar-item-value');
	return {
		speed: values[0]?.textContent,
		time: values[1]?.textContent,
		bytes: values[2]?.textContent,
		protocol: values[3]?.textContent
	};
}

suite('TurboFileTaskbarProgress', () => {
	test('a same-host directory task shows initial metrics and a working cancel button with terminal open', () => {
		const editor = createHarness();
		const task = editor.beginTask('transfer', '复制目录', '62 -> 62', false);
		editor.container.querySelector('.turbofile-statusbar-cancel')!.listeners.get('click')!();
		assert.deepStrictEqual({ ...readMetrics(editor), cancelCalls: editor.cancelCalls, renders: editor.renders, terminalOpen: editor.taskbarHiddenForTerminal }, {
			speed: '0 B/s', time: '12.5s', bytes: '0 B', protocol: '同机复制', cancelCalls: [[task]], renders: 0, terminalOpen: true
		});
	});

	test('speed bytes and time update together without replacing their DOM or the cancel button', () => {
		const editor = createHarness();
		editor.beginTask('transfer', '复制目录', '62 -> 62', false);
		const metrics = editor.container.querySelector('.turbofile-statusbar-section.is-right');
		const cancel = editor.container.querySelector('.turbofile-statusbar-cancel');
		editor.summary = { transferredBytes: 2 ** 33, totalBytes: 2 ** 35, speedBytesPerSecond: 400000000 };
		editor.time = { text: '13.0s', title: '剩余时间' };
		editor.refreshTaskbarMetrics();
		assert.deepStrictEqual({ ...readMetrics(editor), sameMetrics: metrics === editor.container.querySelector('.turbofile-statusbar-section.is-right'), sameCancel: cancel === editor.container.querySelector('.turbofile-statusbar-cancel'), renders: editor.renders }, {
			speed: '400000000 B/s', time: '13.0s', bytes: '8589934592 B / 34359738368 B', protocol: '同机复制', sameMetrics: true, sameCancel: true, renders: 0
		});
		assert.strictEqual(editor.container.querySelectorAll('.turbofile-statusbar-section.is-right .turbofile-statusbar-item')[1].attributes.get('title'), '剩余时间');
	});

	test('unknown totals keep speed bytes and elapsed time while clearing the obsolete denominator', () => {
		const editor = createHarness();
		editor.summary.totalBytes = 100;
		editor.beginTask('transfer', '复制文件', '62 -> 62', false);
		const start = readMetrics(editor);
		editor.summary = { transferredBytes: 40, speedBytesPerSecond: 20 };
		editor.time = { text: '13.0s', title: '已耗时' };
		editor.refreshTaskbarMetrics();
		assert.deepStrictEqual({ start, later: readMetrics(editor) }, {
			start: { speed: '0 B/s', time: '12.5s', bytes: '0 B / 100 B', protocol: '同机复制' },
			later: { speed: '20 B/s', time: '13.0s', bytes: '40 B', protocol: '同机复制' }
		});
	});

	test('same-host byte events above 2 GiB calculate a positive live speed and reach the status text without a total', () => {
		const clock = sinon.useFakeTimers({ now: 1000 });
		try {
			const editor = createHarness();
			editor.useTaskMetrics = true;
			const task = editor.beginTask('transfer', '复制目录', '60 -> 60', false);
			task.progressId = 'same-host-speed';
			task.trackTotalBytes = false;
			const event: ITurboFileTransferProgressEvent = { progressId: task.progressId, phase: 'transfer', state: 'transferring', strategy: 'remote-copy', transferredBytes: 0, totalBytes: 0, detail: 'Native copy.' };
			editor.updateTransferProgress(task, event);
			clock.tick(1000);
			editor.updateTransferProgress(task, { ...event, transferredBytes: 3 * 2 ** 30 });
			assert.deepStrictEqual(readMetrics(editor), { speed: '3221225472 B/s', time: '12.5s', bytes: '3221225472 B', protocol: '同机复制' });
			assert.strictEqual(editor.renders, 0);
		} finally {
			clock.restore();
		}
	});

	test('explicit taskbar hiding remains a user preference independent of terminal state', () => {
		const editor = createHarness();
		editor.showTaskbar = false;
		editor.beginTask('transfer', '复制目录', '62 -> 62', false);
		assert.strictEqual(editor.container.querySelector('.turbofile-taskbar'), undefined);
	});

	for (const status of ['error', 'canceled', 'success'] as const) {
		test(`${status} replaces live metrics with the final state and only success completes task percentage`, () => {
			const editor = createHarness();
			const task = editor.beginTask('transfer', '复制目录', '62 -> 62', false);
			task.progress = 27;
			editor.finishTask(task, status, '已结束', {}, false);
			assert.deepStrictEqual({ status: readMetrics(editor).speed, taskProgress: task.progress, cancel: editor.container.querySelector('.turbofile-statusbar-cancel') }, {
				status: status === 'success' ? '完成' : status === 'canceled' ? '已取消' : '失败', taskProgress: status === 'success' ? 100 : 27, cancel: undefined
			});
		});
	}

	test('the original horizontal progress element remains hidden and narrow windows retain cancellation', () => {
		const css = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/media/turbofile.css'), 'utf8');
		const progress = css.match(/\.turbofile-statusbar-progress\s*\{([^}]+)\}/)?.[1] ?? '';
		const active = css.match(/\.turbofile-statusbar-progress\.is-running\s*\{([^}]+)\}/)?.[1] ?? '';
		const narrowWindow = css.slice(css.indexOf('@media (max-width: 980px)'));
		assert.deepStrictEqual({ hidden: /display:\s*none/.test(progress), shownWhileRunning: /display:\s*block/.test(active), hidesAllActions: /\.turbofile-statusbar-section\.is-right\s*\{\s*display:\s*none/.test(css), hidesAllMetrics: /\.turbofile-statusbar-section\.is-right \.turbofile-statusbar-item\s*\{\s*display:\s*none/.test(narrowWindow), hidesSecondaryMetrics: /\.turbofile-statusbar-section\.is-right \.turbofile-statusbar-item:not\(:first-child\)\s*\{\s*display:\s*none/.test(narrowWindow), animatesUnknown: css.includes('@keyframes turbofile-statusbar-progress-indeterminate') }, {
			hidden: true, shownWhileRunning: false, hidesAllActions: false, hidesAllMetrics: false, hidesSecondaryMetrics: true, animatesUnknown: false
		});
		const editor = createHarness();
		editor.beginTask('transfer', '复制目录', '60 -> 60', false);
		assert.strictEqual(editor.container.querySelector('.turbofile-statusbar-progress')!.attributes.get('role'), undefined);
	});
});
