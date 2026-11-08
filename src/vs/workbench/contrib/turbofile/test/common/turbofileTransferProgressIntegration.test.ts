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
import type { ITurboFileTransferProgressDialogData } from '../../browser/turbofileTransferProgressDialog.js';
import { aggregateTurboFileTransferProgress, isTurboFileTransferProgressQuiet } from '../../common/turbofileTransferDisplay.js';
import { getTurboFileTransferProgressView, TurboFileTransferSpeedHistory } from '../../common/turbofileTransferProgressView.js';

interface IProgressTask {
	id: number;
	kind: 'transfer';
	status: 'running' | 'success' | 'error' | 'canceled';
	trackTotalBytes: boolean;
	label: string;
	detail: string;
	strategy?: string;
	transferredBytes?: number;
	transferProgressBytes?: number;
	totalBytes?: number;
	speedBytesPerSecond?: number;
	bytes?: number;
	durationMs?: number;
	averageBytesPerSecond?: number;
	error?: string;
	startedAt: number;
	transferStartedAt?: number;
	lastProgressAt?: number;
	endedAt?: number;
	cancelRequested?: boolean;
	transferSource?: string;
	transferTarget?: string;
}

interface IProgressHarness {
	tasks: IProgressTask[];
	updates: ITurboFileTransferProgressDialogData[];
	transferProgressTaskIds: number[];
	transferProgressTasks: IProgressTask[] | undefined;
	transferProgressHistory: TurboFileTransferSpeedHistory;
	isEditorVisible: boolean;
	refreshTransferProgressDialog(): void;
}

/** Execute the editor's actual integration methods with inert presentation and no workbench services. */
function createHarness(tasks: IProgressTask[], selectedIds = tasks.map(task => task.id)): IProgressHarness {
	const editorPath = path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts');
	const source = ts.createSourceFile(editorPath, fs.readFileSync(editorPath, 'utf8'), ts.ScriptTarget.Latest, true);
	const names = new Set(['refreshTransferProgressDialog', 'getLiveTransferAggregate']);
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
		updates = [];
		transferProgressTaskIds = [];
		transferProgressTasks = undefined;
		transferProgressHistory = new TurboFileTransferSpeedHistory();
		transferProgressDialog = { value: { update: data => this.updates.push(data) } };
		isEditorVisible = true;
		activePage = 'transfer';
		container = { classList: { contains: () => false } };
		formatSpeed(value) { return value + ' B/s'; }
		getTransferProtocolLabel(strategy) { return strategy; }
		${methods.join('\n')}
	}`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
	const Harness: new () => IProgressHarness = new Function('localize', 'formatSize', 'formatDuration', 'aggregateTurboFileTransferProgress', 'isTurboFileTransferProgressQuiet', 'getTurboFileTransferProgressView', 'TurboFileTransferSpeedHistory', `${code}; return Harness;`)(
		localize, (bytes: number) => `${bytes} B`, (elapsed: number) => `${elapsed} ms`, aggregateTurboFileTransferProgress, isTurboFileTransferProgressQuiet, getTurboFileTransferProgressView, TurboFileTransferSpeedHistory
	);
	const harness = new Harness();
	harness.tasks = tasks;
	harness.transferProgressTaskIds = selectedIds;
	return harness;
}

function task(id: number, overrides: Partial<IProgressTask> = {}): IProgressTask {
	return {
		id, kind: 'transfer', status: 'running', trackTotalBytes: true, strategy: 'sftp-upload',
		label: `文件 ${id}`, detail: '传输中', startedAt: 1000, lastProgressAt: 20000,
		transferredBytes: 620, transferProgressBytes: 620, totalBytes: 1000, speedBytesPerSecond: 100,
		...overrides
	};
}

function latest(harness: IProgressHarness): ITurboFileTransferProgressDialogData {
	assert.ok(harness.updates.length > 0, 'The selected transfer view must receive an update');
	return harness.updates[harness.updates.length - 1];
}

suite('TurboFileTransferProgressIntegration', () => {
	test('a failed member retains its bytes and error while a sibling runs, then determines final status', () => {
		const clock = sinon.useFakeTimers({ now: 20000 });
		try {
			const failed = task(1, { status: 'error', transferredBytes: 400, transferProgressBytes: 400, error: '目标磁盘已满', endedAt: 19000, cancelRequested: true });
			const sibling = task(2, { transferredBytes: 300, transferProgressBytes: 300 });
			const unrelated = task(3, { transferredBytes: 9999, transferProgressBytes: 9999, speedBytesPerSecond: 999 });
			const harness = createHarness([failed, sibling, unrelated], [1, 2]);
			harness.refreshTransferProgressDialog();
			const running = latest(harness);
			assert.deepStrictEqual({ bytes: running.metrics.transferredBytes, speed: running.metrics.speedBytesPerSecond, status: running.metrics.status, detail: running.detail, name: running.name, cancelable: running.cancelable, canceling: running.canceling, selection: harness.transferProgressTaskIds }, {
				bytes: 700, speed: 100, status: 'running', detail: '目标磁盘已满', name: '2 个传输任务', cancelable: true, canceling: false, selection: [1, 2]
			});
			sibling.status = 'success';
			sibling.transferredBytes = 1000;
			sibling.transferProgressBytes = 1000;
			sibling.bytes = 1000;
			sibling.endedAt = 22000;
			clock.tick(2000);
			harness.refreshTransferProgressDialog();
			const finished = latest(harness);
			assert.deepStrictEqual({ bytes: finished.metrics.transferredBytes, speed: finished.metrics.speedBytesPerSecond, status: finished.metrics.status, state: finished.state, detail: finished.detail, cancelable: finished.cancelable, unrelatedRunning: unrelated.status }, {
				bytes: 1400, speed: 0, status: 'error', state: '传输失败', detail: '目标磁盘已满', cancelable: false, unrelatedRunning: 'running'
			});
		} finally {
			clock.restore();
		}
	});

	test('an open view retains failed task objects even when bounded history evicts them', () => {
		const clock = sinon.useFakeTimers({ now: 20000 });
		try {
			const failed = task(1, { status: 'error', transferredBytes: 400, transferProgressBytes: 400, error: '目标磁盘已满', endedAt: 19000 });
			const sibling = task(2, { transferredBytes: 300, transferProgressBytes: 300 });
			const harness = createHarness([failed, sibling]);
			harness.transferProgressTasks = [failed, sibling];
			harness.refreshTransferProgressDialog();
			// History cleanup may remove completed or failed tasks while a sibling is still active.
			harness.tasks = [sibling];
			clock.tick(500);
			harness.refreshTransferProgressDialog();
			const running = latest(harness);
			sibling.status = 'success';
			sibling.transferredBytes = 1000;
			sibling.transferProgressBytes = 1000;
			sibling.endedAt = 21000;
			clock.tick(500);
			harness.refreshTransferProgressDialog();
			const finished = latest(harness);
			assert.deepStrictEqual({ evicted: !harness.tasks.includes(failed), running: { bytes: running.metrics.transferredBytes, detail: running.detail, cancelable: running.cancelable }, finished: { bytes: finished.metrics.transferredBytes, status: finished.metrics.status, detail: finished.detail, cancelable: finished.cancelable } }, {
				evicted: true,
				running: { bytes: 700, detail: '目标磁盘已满', cancelable: true },
				finished: { bytes: 1400, status: 'error', detail: '目标磁盘已满', cancelable: false }
			});
		} finally {
			clock.restore();
		}
	});

	test('Tar retains the measured archive count after success instead of substituting raw file bytes', () => {
		const clock = sinon.useFakeTimers({ now: 20000 });
		try {
			for (const strategy of ['tar-upload', 'tar-download', 'tar-relay']) {
				const transfer = task(1, { strategy, transferredBytes: 123456, transferProgressBytes: 123456, totalBytes: 120000 });
				const harness = createHarness([transfer]);
				harness.refreshTransferProgressDialog();
				const running = latest(harness);
				transfer.status = 'success';
				transfer.bytes = 120000;
				transfer.transferredBytes = 120000;
				transfer.endedAt = 21000;
				clock.tick(1000);
				harness.refreshTransferProgressDialog();
				const finished = latest(harness);
				assert.deepStrictEqual({ strategy, runningBytes: running.metrics.transferredBytes, finalBytes: finished.metrics.transferredBytes, total: finished.metrics.totalBytes, percentage: finished.metrics.percentage, state: finished.state, headlineSpeed: finished.speed, measuredSpeed: finished.metrics.speedBytesPerSecond }, {
					strategy, runningBytes: 123456, finalBytes: 123456, total: undefined, percentage: undefined, state: '已完成', headlineSpeed: '6000 B/s', measuredSpeed: 0
				});
			}
		} finally {
			clock.restore();
		}
	});

	test('success displays payload average speed while preserving the measured archive counter and stopped graph', () => {
		const clock = sinon.useFakeTimers({ now: 20000 });
		try {
			const transfer = task(1, { strategy: 'tar-upload', transferredBytes: 2000, transferProgressBytes: 2000, totalBytes: 1000, speedBytesPerSecond: 100 });
			const harness = createHarness([transfer]);
			harness.refreshTransferProgressDialog();
			const running = latest(harness);
			transfer.status = 'success';
			transfer.bytes = 1000;
			transfer.transferredBytes = 1000;
			transfer.endedAt = 21000;
			clock.tick(1000);
			harness.refreshTransferProgressDialog();
			const finished = latest(harness);
			assert.deepStrictEqual({
				runningHeadline: running.speed,
				finishedHeadline: finished.speed,
				status: finished.metrics.status,
				measuredBytes: finished.metrics.transferredBytes,
				currentRate: finished.metrics.speedBytesPerSecond,
				elapsed: finished.metrics.elapsedMs,
				time: finished.time,
				history: finished.history,
				cancelable: finished.cancelable
			}, {
				runningHeadline: '100 B/s',
				finishedHeadline: '50 B/s',
				status: 'success',
				measuredBytes: 2000,
				currentRate: 0,
				elapsed: 20000,
				time: '总耗时：20000 ms',
				history: [{ elapsedMs: 19000, speedBytesPerSecond: 100 }, { elapsedMs: 20000, speedBytesPerSecond: 0 }],
				cancelable: false
			});
		} finally {
			clock.restore();
		}
	});

	test('completed headline and total time use the canonical task accounting without extending the data-phase curve', () => {
		const clock = sinon.useFakeTimers({ now: 25000 });
		try {
			const transfer = task(1, {
				status: 'success', strategy: 'tar-upload',
				startedAt: 1000, transferStartedAt: 5000, endedAt: 25000,
				durationMs: 25000, averageBytesPerSecond: 80,
				bytes: 1999, transferredBytes: 1999, transferProgressBytes: 3000, speedBytesPerSecond: 999
			});
			const harness = createHarness([transfer]);
			harness.refreshTransferProgressDialog();
			const finished = latest(harness);
			assert.deepStrictEqual({ speed: finished.speed, time: finished.time, elapsed: finished.metrics.elapsedMs, currentRate: finished.metrics.speedBytesPerSecond, history: finished.history }, {
				speed: '80 B/s', time: '总耗时：25000 ms', elapsed: 20000, currentRate: 0, history: [{ elapsedMs: 20000, speedBytesPerSecond: 0 }]
			});
		} finally {
			clock.restore();
		}
	});

	test('successful task groups average total payload over the shared elapsed interval rather than summing rates', () => {
		const clock = sinon.useFakeTimers({ now: 21000 });
		try {
			const first = task(1, { status: 'success', strategy: 'tar-upload', bytes: 1000, transferredBytes: 1000, transferProgressBytes: 2000, endedAt: 21000, speedBytesPerSecond: 10 });
			const second = task(2, { status: 'success', bytes: 500, transferredBytes: 500, transferProgressBytes: 500, totalBytes: 500, startedAt: 11000, endedAt: 21000, speedBytesPerSecond: 20 });
			const harness = createHarness([first, second]);
			harness.refreshTransferProgressDialog();
			const finished = latest(harness);
			assert.deepStrictEqual({ speed: finished.speed, currentRate: finished.metrics.speedBytesPerSecond, status: finished.metrics.status, elapsed: finished.metrics.elapsedMs, time: finished.time, history: finished.history }, {
				speed: '75 B/s', currentRate: 0, status: 'success', elapsed: 20000, time: '总耗时：20000 ms', history: [{ elapsedMs: 20000, speedBytesPerSecond: 0 }]
			});
		} finally {
			clock.restore();
		}
	});

	test('a reliable ordinary-file total uses the real counters and keeps source and target identity', () => {
		const clock = sinon.useFakeTimers({ now: 20000 });
		try {
			const harness = createHarness([task(1, { transferSource: 'Windows D:\\Work\\test.tar', transferTarget: '64服务器 /home/ubuntu/test.tar' })]);
			harness.refreshTransferProgressDialog();
			const view = latest(harness);
			assert.deepStrictEqual({ bytes: view.metrics.transferredBytes, total: view.metrics.totalBytes, percent: view.metrics.percentage, remaining: view.metrics.remainingMs, state: view.state, source: view.source, target: view.target }, {
				bytes: 620, total: 1000, percent: 62, remaining: 3800, state: '62%', source: 'Windows D:\\Work\\test.tar', target: '64服务器 /home/ubuntu/test.tar'
			});
		} finally {
			clock.restore();
		}
	});

	test('directory or mixed Tar totals remain unknown even when transport events include a denominator', () => {
		const clock = sinon.useFakeTimers({ now: 20000 });
		try {
			for (const tasks of [
				[task(1, { trackTotalBytes: false, totalBytes: 100000 })],
				[task(1), task(2, { strategy: 'tar-upload', totalBytes: 100000 })]
			]) {
				const harness = createHarness(tasks);
				harness.refreshTransferProgressDialog();
				const view = latest(harness);
				assert.deepStrictEqual({ total: view.metrics.totalBytes, percentage: view.metrics.percentage, remaining: view.metrics.remainingMs, state: view.state, time: view.time, bytes: view.metrics.transferredBytes }, {
					total: undefined, percentage: undefined, remaining: undefined, state: '传输中', time: '已用时间：19000 ms', bytes: 620 * tasks.length
				});
			}
		} finally {
			clock.restore();
		}
	});

	test('a hidden editor samples bounded history without updating the retained dialog DOM', () => {
		const clock = sinon.useFakeTimers({ now: 20000 });
		try {
			const harness = createHarness([task(1)]);
			harness.isEditorVisible = false;
			harness.refreshTransferProgressDialog();
			assert.deepStrictEqual({ updates: harness.updates.length, history: harness.transferProgressHistory.read() }, {
				updates: 0, history: [{ elapsedMs: 19000, speedBytesPerSecond: 100 }]
			});
		} finally {
			clock.restore();
		}
	});
});
