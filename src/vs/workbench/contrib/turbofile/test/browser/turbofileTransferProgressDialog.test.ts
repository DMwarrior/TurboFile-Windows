/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ITurboFileTransferProgressDialogData, TurboFileTransferProgressDialog } from '../../browser/turbofileTransferProgressDialog.js';
import { getTurboFileTransferProgressView } from '../../common/turbofileTransferProgressView.js';
import '../../browser/media/turbofile.css';

suite('TurboFileTransferProgressDialog', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let container: HTMLElement;

	setup(() => {
		container = document.createElement('div');
		container.className = 'turbofile-workbench is-turbofile-light';
		container.style.width = '900px';
		container.style.height = '700px';
		container.style.setProperty('--vscode-editor-background', '#252526');
		container.style.setProperty('--vscode-foreground', '#cccccc');
		container.style.setProperty('--vscode-descriptionForeground', '#aaaaaa');
		document.body.appendChild(container);
	});

	teardown(() => container.remove());

	function createDialog() {
		const calls = { close: 0, cancel: 0 };
		const dialog = disposables.add(new TurboFileTransferProgressDialog(
			() => calls.close++,
			() => calls.cancel++,
			speed => `${Math.round(speed)} B/s`
		));
		container.appendChild(dialog.element);
		return { dialog, calls };
	}

	function button(dialog: TurboFileTransferProgressDialog, label: string): HTMLButtonElement {
		const control = dialog.element.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
		assert.ok(control, `Missing ${label} control`);
		return control;
	}

	function data(overrides: Partial<ITurboFileTransferProgressDialogData> = {}): ITurboFileTransferProgressDialogData {
		return {
			metrics: getTurboFileTransferProgressView({ status: 'running', transferredBytes: 620, totalBytes: 1000, elapsedMs: 19000, speedBytesPerSecond: 100 }),
			history: [{ elapsedMs: 18500, speedBytesPerSecond: 90 }, { elapsedMs: 19000, speedBytesPerSecond: 100 }],
			speed: '100 B/s',
			size: '已传输：620 B / 1000 B',
			time: '预计剩余：3.8 秒',
			state: '62%',
			name: '测试文件.tar',
			source: 'Windows D:\\Work\\test\\测试文件.tar',
			target: '64服务器 /home/ubuntu/test',
			detail: 'SFTP',
			cancelable: true,
			canceling: false,
			theme: 'light',
			...overrides
		};
	}

	test('minimize, close and Escape dismiss only the display, never the transfer', () => {
		const { dialog, calls } = createDialog();
		dialog.update(data());
		button(dialog, '收起传输进度').click();
		button(dialog, '关闭传输进度').click();
		const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
		dialog.element.dispatchEvent(escape);
		assert.deepStrictEqual({ ...calls, escapePrevented: escape.defaultPrevented }, { close: 3, cancel: 0, escapePrevented: true });
	});

	test('clicking within the panel never dismisses it and cancel has its own callback', () => {
		const { dialog, calls } = createDialog();
		dialog.update(data());
		dialog.element.querySelector<HTMLElement>('.turbofile-transfer-progress-speed')!.click();
		dialog.element.querySelector<HTMLButtonElement>('.turbofile-transfer-progress-cancel')!.click();
		assert.deepStrictEqual(calls, { close: 0, cancel: 1 });
	});

	test('known totals expose a percentage and unknown totals clear it without stale total or ETA text', () => {
		const { dialog } = createDialog();
		dialog.update(data());
		const track = dialog.element.querySelector<HTMLElement>('[role="progressbar"]')!;
		const fill = track.firstElementChild as HTMLElement;
		const known = { value: track.getAttribute('aria-valuenow'), width: fill.style.width, indeterminate: track.classList.contains('is-indeterminate') };
		dialog.update(data({
			metrics: getTurboFileTransferProgressView({ status: 'running', transferredBytes: 620, elapsedMs: 19000, speedBytesPerSecond: 100 }),
			state: '传输中', size: '已传输：620 B', time: '已用时间：19 秒'
		}));
		assert.deepStrictEqual({ known, unknown: { value: track.getAttribute('aria-valuenow'), width: fill.style.width, indeterminate: track.classList.contains('is-indeterminate'), state: track.getAttribute('aria-valuetext') }, obsoleteText: /1000 B|预计剩余|62%/.test(dialog.element.textContent ?? '') }, {
			known: { value: '62', width: '62%', indeterminate: false },
			unknown: { value: null, width: '', indeterminate: true, state: '传输中' },
			obsoleteText: false
		});
	});

	test('running-at-total stays in finishing state and only backend success is exposed as complete', () => {
		const { dialog } = createDialog();
		const metrics = { transferredBytes: 1000, totalBytes: 1000, elapsedMs: 20000, speedBytesPerSecond: 100 };
		dialog.update(data({ metrics: getTurboFileTransferProgressView({ ...metrics, status: 'running' }), state: '正在完成', time: '已用时间：20 秒' }));
		const track = dialog.element.querySelector<HTMLElement>('[role="progressbar"]')!;
		const speedLabel = dialog.element.querySelector<HTMLElement>('.turbofile-transfer-progress-speed-label')!;
		const footer = dialog.element.querySelector<HTMLElement>('.turbofile-transfer-progress-footer')!;
		const finishing = { value: track.getAttribute('aria-valuenow'), settling: track.classList.contains('is-settling'), complete: track.classList.contains('is-complete'), speedLabel: speedLabel.textContent, footerHidden: footer.hidden };
		dialog.update(data({ metrics: getTurboFileTransferProgressView({ ...metrics, status: 'success' }), state: '已完成', cancelable: false }));
		assert.deepStrictEqual({ finishing, success: { value: track.getAttribute('aria-valuenow'), settling: track.classList.contains('is-settling'), complete: track.classList.contains('is-complete'), speedLabel: speedLabel.textContent, footerHidden: footer.hidden }, cancelHidden: dialog.element.querySelector<HTMLButtonElement>('.turbofile-transfer-progress-cancel')!.hidden }, {
			finishing: { value: '99', settling: true, complete: false, speedLabel: '当前速度', footerHidden: false },
			success: { value: '100', settling: false, complete: true, speedLabel: '平均速度', footerHidden: true },
			cancelHidden: true
		});
	});

	test('the wide dock stays above the status bar on a 1536 by 1024 surface and shrinks after completion', () => {
		container.style.width = '1536px';
		// The workbench allocates a 1002px editor above its separate native 22px status-bar slot.
		container.style.height = '1002px';
		container.style.position = 'absolute';
		container.style.top = '0';
		container.style.left = '0';
		const statusbar = document.createElement('div');
		statusbar.style.cssText = 'position:absolute;left:0;top:1002px;width:1536px;height:22px';
		document.body.appendChild(statusbar);
		disposables.add({ dispose: () => statusbar.remove() });
		const { dialog } = createDialog();
		dialog.update(data());
		const panel = dialog.element.querySelector<HTMLElement>('[role="dialog"]')!;
		const active = panel.getBoundingClientRect();
		const surface = container.getBoundingClientRect();
		const statusbarTop = statusbar.getBoundingClientRect().top;
		assert.deepStrictEqual({ fullWidth: Math.abs(active.width - surface.width) <= 1, leftAligned: Math.abs(active.left - surface.left) <= 1, flushAboveStatusbar: Math.abs(active.bottom - statusbarTop) <= 1, compact: active.height <= 360, overlayPassesBackground: getComputedStyle(dialog.element).pointerEvents, panelInteractive: getComputedStyle(panel).pointerEvents, horizontalOverflow: panel.scrollWidth > panel.clientWidth }, {
			fullWidth: true, leftAligned: true, flushAboveStatusbar: true, compact: true, overlayPassesBackground: 'none', panelInteractive: 'auto', horizontalOverflow: false
		});
		dialog.update(data({ metrics: getTurboFileTransferProgressView({ status: 'success', transferredBytes: 1000, totalBytes: 1000, elapsedMs: 20000, speedBytesPerSecond: 50 }), state: '已完成', cancelable: false }));
		const completed = panel.getBoundingClientRect();
		assert.ok(completed.height <= active.height - 30, 'Hiding the completed footer should reclaim its height');
		assert.ok(Math.abs(completed.bottom - statusbarTop) <= 1, 'Completion must retain bottom alignment');
	});

	test('the real canvas draws a blue measured line and continuous translucent area in both themes', async () => {
		const { dialog } = createDialog();
		const history = [20, 40, 65, 35, 75, 60, 85, 45].map((speed, index) => ({ elapsedMs: index * 500, speedBytesPerSecond: speed * 1024 * 1024 }));
		const canvas = dialog.element.querySelector<HTMLCanvasElement>('canvas')!;
		for (const light of [true, false]) {
			container.classList.toggle('is-turbofile-light', light);
			dialog.update(data({ history, theme: light ? 'light' : 'dark' }));
			// Let the real ResizeObserver report the chart's layout before reading canvas pixels.
			await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
			const context = canvas.getContext('2d');
			assert.ok(context);
			const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
			const ratio = canvas.width / canvas.getBoundingClientRect().width;
			const containsPlotColor = (rgb: readonly number[]): boolean => {
				for (let y = Math.ceil(21 * ratio); y < canvas.height - 25 * ratio; y++) {
					for (let x = Math.ceil(80 * ratio); x < canvas.width; x++) {
						const index = (y * canvas.width + x) * 4;
						if (pixels[index + 3] > 80 && rgb.every((value, channel) => Math.abs(pixels[index + channel] - value) <= 2)) {
							return true;
						}
					}
				}
				return false;
			};
			// At this height all measured points lie above the row. A continuous filled
			// area covers it; the removed Steam bars leave most of these pixels empty.
			const row = Math.floor((canvas.getBoundingClientRect().height - 30) * ratio);
			let filled = 0;
			let sampled = 0;
			for (let x = Math.ceil(150 * ratio); x < canvas.width - 10 * ratio; x++) {
				const index = (row * canvas.width + x) * 4;
				sampled++;
				if (pixels[index + 3] > 8 && pixels[index + 3] < 80 && pixels[index + 2] > pixels[index]) {
					filled++;
				}
			}
			assert.deepStrictEqual({ light, line: containsPlotColor(light ? [0, 120, 212] : [59, 142, 234]), continuousArea: sampled > 100 && filled / sampled > 0.9, greenTrend: containsPlotColor(light ? [76, 127, 37] : [120, 180, 66]) }, {
				light, line: true, continuousArea: true, greenTrend: false
			});
		}
	});

	test('progress motion stops for terminal, settling and canceling states', () => {
		const { dialog } = createDialog();
		const track = dialog.element.querySelector<HTMLElement>('[role="progressbar"]')!;
		const states = (['running', 'waiting', 'success', 'error', 'canceled'] as const).map(status => {
			dialog.update(data({ metrics: getTurboFileTransferProgressView({ status, transferredBytes: 620, totalBytes: 1000, elapsedMs: 19000, speedBytesPerSecond: 100 }) }));
			return { status, animated: track.classList.contains('is-animated') };
		});
		dialog.update(data({ metrics: getTurboFileTransferProgressView({ status: 'running', transferredBytes: 1000, totalBytes: 1000, elapsedMs: 20000, speedBytesPerSecond: 100 }) }));
		const settlingAnimated = track.classList.contains('is-animated');
		dialog.update(data({ canceling: true }));
		assert.deepStrictEqual({ states, settlingAnimated, cancelingAnimated: track.classList.contains('is-animated') }, {
			states: [
				{ status: 'running', animated: true }, { status: 'waiting', animated: false },
				{ status: 'success', animated: false }, { status: 'error', animated: false }, { status: 'canceled', animated: false }
			],
			settlingAnimated: false, cancelingAnimated: false
		});
	});

	test('the white endpoint remains hidden at zero without inflating measured progress', () => {
		const { dialog } = createDialog();
		dialog.update(data({ metrics: getTurboFileTransferProgressView({ status: 'running', transferredBytes: 0, totalBytes: 1000, elapsedMs: 0, speedBytesPerSecond: 0 }), state: '0%' }));
		const track = dialog.element.querySelector<HTMLElement>('[role="progressbar"]')!;
		const fill = track.firstElementChild as HTMLElement;
		assert.deepStrictEqual({ percentage: track.getAttribute('aria-valuenow'), width: getComputedStyle(fill).width, endpointDisplay: getComputedStyle(fill, '::after').display }, {
			percentage: '0', width: '0px', endpointDisplay: 'none'
		});
	});

	test('background visibility pauses progress motion and disposal removes its document listener', () => {
		const { dialog } = createDialog();
		dialog.update(data());
		const track = dialog.element.querySelector<HTMLElement>('[role="progressbar"]')!;
		const previous = Object.getOwnPropertyDescriptor(document, 'hidden');
		let hidden = false;
		try {
			Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
			hidden = true;
			document.dispatchEvent(new Event('visibilitychange'));
			const backgroundAnimated = track.classList.contains('is-animated');
			dialog.update(data());
			hidden = false;
			document.dispatchEvent(new Event('visibilitychange'));
			const foregroundAnimated = track.classList.contains('is-animated');
			dialog.dispose();
			hidden = true;
			document.dispatchEvent(new Event('visibilitychange'));
			assert.deepStrictEqual({ backgroundAnimated, foregroundAnimated, detachedUnchanged: track.classList.contains('is-animated'), connected: dialog.element.isConnected }, {
				backgroundAnimated: false, foregroundAnimated: true, detachedUnchanged: true, connected: false
			});
		} finally {
			if (previous) {
				Object.defineProperty(document, 'hidden', previous);
			} else {
				Reflect.deleteProperty(document, 'hidden');
			}
		}
	});

	for (const status of ['error', 'canceled'] as const) {
		test(`${status} with an unknown total stops activity without displaying a completed bar`, () => {
			const { dialog } = createDialog();
			const metrics = { transferredBytes: 620, elapsedMs: 19000, speedBytesPerSecond: 100 };
			dialog.update(data({ metrics: getTurboFileTransferProgressView({ ...metrics, status: 'running' }), state: '传输中' }));
			dialog.update(data({ metrics: getTurboFileTransferProgressView({ ...metrics, status }), state: status === 'error' ? '传输失败' : '已取消', cancelable: false }));
			const track = dialog.element.querySelector<HTMLElement>('[role="progressbar"]')!;
			const fill = track.firstElementChild as HTMLElement;
			assert.deepStrictEqual({ value: track.getAttribute('aria-valuenow'), active: track.classList.contains('is-indeterminate'), complete: track.classList.contains('is-complete'), width: getComputedStyle(fill).width }, {
				value: null, active: false, complete: false, width: '0px'
			});
		});
	}

	test('half-second updates preserve all DOM nodes, focused control and separate cancellation state', () => {
		const { dialog, calls } = createDialog();
		dialog.update(data());
		dialog.focus();
		const focused = document.activeElement;
		const nodes = [...dialog.element.querySelectorAll('*')];
		for (let index = 1; index <= 120; index++) {
			dialog.update(data({
				metrics: getTurboFileTransferProgressView({ status: 'running', transferredBytes: index, totalBytes: 1000, elapsedMs: index * 500, speedBytesPerSecond: index }),
				speed: `${index} B/s`, state: `${Math.floor(index / 10)}%`
			}));
		}
		const cancel = dialog.element.querySelector<HTMLButtonElement>('.turbofile-transfer-progress-cancel')!;
		dialog.update(data({ canceling: true }));
		cancel.click();
		assert.deepStrictEqual({ sameNodes: nodes.every((node, index) => node === dialog.element.querySelectorAll('*')[index]), sameCount: dialog.element.querySelectorAll('*').length === nodes.length, sameFocus: document.activeElement === focused, focusedClose: focused === button(dialog, '关闭传输进度'), disabled: cancel.disabled, label: cancel.textContent, calls }, {
			sameNodes: true, sameCount: true, sameFocus: true, focusedClose: true, disabled: true, label: '正在取消…', calls: { close: 0, cancel: 0 }
		});
	});

	test('disposing removes the overlay and all close and cancel listeners', () => {
		const { dialog, calls } = createDialog();
		dialog.update(data());
		const close = button(dialog, '关闭传输进度');
		const cancel = dialog.element.querySelector<HTMLButtonElement>('.turbofile-transfer-progress-cancel')!;
		dialog.dispose();
		close.click();
		cancel.click();
		dialog.element.click();
		dialog.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		assert.deepStrictEqual({ connected: dialog.element.isConnected, remaining: container.children.length, calls }, { connected: false, remaining: 0, calls: { close: 0, cancel: 0 } });
	});
});
