/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, getWindow } from '../../../../base/browser/dom.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { ITurboFileTransferProgressView, ITurboFileTransferSpeedPoint, TURBOFILE_TRANSFER_SPEED_HISTORY_WINDOW_MS } from '../common/turbofileTransferProgressView.js';
import { ITurboFileProgressMotion, TurboFileProgressMotion } from '../common/turbofileProgressMotion.js';

export interface ITurboFileTransferProgressDialogData {
	readonly metrics: ITurboFileTransferProgressView;
	readonly history: readonly ITurboFileTransferSpeedPoint[];
	readonly speed: string;
	readonly size: string;
	readonly time: string;
	readonly state: string;
	readonly name: string;
	readonly source: string;
	readonly target: string;
	readonly detail: string;
	readonly cancelable: boolean;
	readonly canceling: boolean;
	readonly theme: string;
}

/** A passive renderer: no transport calls, timers, or directory reads. */
export class TurboFileTransferProgressDialog extends Disposable {
	readonly element = $('.turbofile-transfer-progress-overlay');
	private readonly panel = $('.turbofile-transfer-progress-panel');
	private readonly speedLabel = $('.turbofile-transfer-progress-speed-label');
	private readonly speed = $('.turbofile-transfer-progress-speed');
	private readonly status = $('.turbofile-transfer-progress-status');
	private readonly canvas = document.createElement('canvas');
	private readonly track = $('.turbofile-transfer-progress-track');
	private readonly fill = $('.turbofile-transfer-progress-fill');
	private readonly size = $('span');
	private readonly time = $('span');
	private readonly name = $('.turbofile-transfer-progress-detail-value');
	private readonly source = $('.turbofile-transfer-progress-detail-value');
	private readonly target = $('.turbofile-transfer-progress-detail-value');
	private readonly detail = $('.turbofile-transfer-progress-detail-value');
	private readonly cancel = document.createElement('button');
	private readonly footer = $('.turbofile-transfer-progress-footer');
	private readonly closeButton: HTMLButtonElement;
	private data: ITurboFileTransferProgressDialogData | undefined;
	private readonly progressMotion = new TurboFileProgressMotion();
	private motionPlan: ITurboFileProgressMotion | undefined;
	private progressAnimation: Animation | undefined;
	private readonly reducedMotion = getWindow(this.element).matchMedia('(prefers-reduced-motion: reduce)');
	private width = 0;
	private height = 0;
	private colors: { accent: string; fill: string; grid: string; text: string } | undefined;
	private drawn: { history: readonly ITurboFileTransferSpeedPoint[]; width: number; height: number; ratio: number; theme: string } | undefined;

	constructor(close: () => void, cancel: () => void, private readonly formatRate: (speed: number) => string) {
		super();
		this.panel.setAttribute('role', 'dialog');
		this.panel.setAttribute('aria-label', localize('turbofile.progress.title', "传输进度"));
		const header = $('.turbofile-transfer-progress-header');
		const title = $('h2.turbofile-transfer-progress-title');
		title.textContent = localize('turbofile.progress.title', "传输进度");
		const actions = $('.turbofile-transfer-progress-actions');
		for (const [icon, label] of [
			[Codicon.chromeMinimize, localize('turbofile.progress.minimize', "收起传输进度")],
			[Codicon.close, localize('turbofile.progress.close', "关闭传输进度")]
		] as const) {
			const button = document.createElement('button');
			button.type = 'button';
			button.className = 'turbofile-toolbar-button';
			button.title = label;
			button.setAttribute('aria-label', label);
			button.appendChild(renderIcon(icon));
			this._register(addDisposableListener(button, 'click', close));
			actions.appendChild(button);
		}
		// The loop always creates both controls.
		this.closeButton = actions.lastElementChild as HTMLButtonElement;
		header.append(title, actions);
		const body = $('.turbofile-transfer-progress-body');
		const hero = $('.turbofile-transfer-progress-hero');
		hero.append(this.speedLabel, this.speed, this.status);
		const graph = $('.turbofile-transfer-progress-graph');
		this.canvas.className = 'turbofile-transfer-progress-graph-canvas';
		this.canvas.setAttribute('role', 'img');
		const graphDescription = localize('turbofile.progress.graph', "最近 60 秒内的传输速度：横轴表示时间，蓝色折线及淡蓝色阴影的高度表示实际传输速度");
		this.canvas.setAttribute('aria-label', graphDescription);
		this.canvas.title = graphDescription;
		graph.appendChild(this.canvas);
		this.track.setAttribute('role', 'progressbar');
		this.track.setAttribute('aria-label', localize('turbofile.progress.title', "传输进度"));
		this.track.appendChild(this.fill);
		this._register(addDisposableListener(this.element.ownerDocument, 'visibilitychange', () => this.updateAnimationState()));
		const motionPreferenceChanged = () => this.updateAnimationState();
		this.reducedMotion.addEventListener('change', motionPreferenceChanged);
		this._register({ dispose: () => this.reducedMotion.removeEventListener('change', motionPreferenceChanged) });
		const stats = $('.turbofile-transfer-progress-stats');
		stats.append(this.size, this.time);
		const details = $('.turbofile-transfer-progress-details');
		for (const [label, value] of [
			[localize('turbofile.progress.task', "任务："), this.name],
			[localize('turbofile.progress.source', "来源："), this.source],
			[localize('turbofile.progress.target', "目标："), this.target],
			[localize('turbofile.progress.state', "状态："), this.detail]
		] as const) {
			const caption = $('.turbofile-transfer-progress-detail-label');
			caption.textContent = label;
			details.append(caption, value);
		}
		body.append(hero, graph, this.track, stats, details);
		this.cancel.type = 'button';
		this.cancel.className = 'turbofile-transfer-progress-cancel';
		this.cancel.textContent = localize('turbofile.progress.cancel', "取消传输");
		this._register(addDisposableListener(this.cancel, 'click', cancel));
		this.footer.appendChild(this.cancel);
		this.panel.append(header, body, this.footer);
		this.element.appendChild(this.panel);
		this._register(addDisposableListener(this.element, 'click', event => {
			if (event.target === this.element) {
				close();
			}
		}));
		this._register(addDisposableListener(this.element, 'keydown', (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				event.preventDefault();
				event.stopPropagation();
				close();
			}
		}));
		for (const type of ['dragover', 'drop']) {
			this._register(addDisposableListener(this.element, type, event => {
				event.preventDefault();
				event.stopPropagation();
			}));
		}
		const observer = new ResizeObserver(entries => {
			const size = entries[0]?.contentRect;
			if (size) {
				this.width = size.width;
				this.height = size.height;
				this.draw();
			}
		});
		observer.observe(graph);
		this._register({ dispose: () => observer.disconnect() });
	}

	focus(): void {
		this.closeButton.focus();
	}

	update(data: ITurboFileTransferProgressDialogData): void {
		if (this.data?.theme !== data.theme) {
			this.colors = undefined;
		}
		if (this.data && (data.name !== this.data.name || data.source !== this.data.source || data.target !== this.data.target
			|| data.metrics.totalBytes !== this.data.metrics.totalBytes || data.metrics.elapsedMs < this.data.metrics.elapsedMs)) {
			this.stopProgressAnimation();
			this.progressMotion.reset(undefined, getWindow(this.element).performance.now());
		}
		this.data = data;
		const metrics = data.metrics;
		this.setText(this.speedLabel, metrics.status === 'success' ? localize('turbofile.progress.averageSpeed', "平均速度") : localize('turbofile.progress.currentSpeed', "当前速度"));
		this.setText(this.speed, data.speed);
		this.setText(this.status, data.state);
		this.status.classList.toggle('is-indeterminate', metrics.percentage === undefined);
		this.status.classList.toggle('is-settling', metrics.status === 'finishing');
		this.status.classList.toggle('is-error', metrics.status === 'error');
		this.setText(this.size, data.size);
		this.setText(this.time, data.time);
		for (const [element, value] of [[this.name, data.name], [this.source, data.source], [this.target, data.target], [this.detail, data.detail]] as const) {
			this.setText(element, value);
			element.title = value;
		}
		const active = metrics.status === 'running' || metrics.status === 'waiting';
		const indeterminate = active && metrics.fraction === undefined;
		this.track.classList.toggle('is-indeterminate', indeterminate);
		this.track.classList.toggle('is-settling', metrics.status === 'finishing');
		this.track.classList.toggle('is-complete', metrics.status === 'success');
		this.track.classList.toggle('is-empty', metrics.status !== 'success' && !indeterminate && (metrics.fraction === undefined || metrics.fraction <= 0));
		this.fill.style.width = metrics.status === 'success' ? '100%'
			: metrics.fraction === undefined ? active ? '' : '0%' : `${metrics.fraction * 100}%`;
		this.updateAnimationState();
		this.track.setAttribute('aria-valuetext', data.state);
		if (metrics.percentage === undefined) {
			this.track.removeAttribute('aria-valuenow');
		} else {
			this.track.setAttribute('aria-valuemin', '0');
			this.track.setAttribute('aria-valuemax', '100');
			this.track.setAttribute('aria-valuenow', String(metrics.percentage));
		}
		this.cancel.hidden = !data.cancelable;
		this.footer.hidden = !data.cancelable;
		this.cancel.disabled = data.canceling;
		this.setText(this.cancel, data.canceling ? localize('turbofile.progress.canceling', "正在取消…") : localize('turbofile.progress.cancel', "取消传输"));
		this.draw();
	}

	private updateAnimationState(): void {
		const animated = this.data?.metrics.status === 'running' && !this.data.canceling
			&& !this.element.ownerDocument.hidden && !this.element.hidden && this.element.isConnected;
		this.track.classList.toggle('is-animated', animated);
		const now = getWindow(this.element).performance.now();
		const fraction = this.data?.metrics.fraction;
		if (!animated || this.reducedMotion.matches || fraction === undefined) {
			this.stopProgressAnimation();
			this.progressMotion.reset(fraction, now);
			return;
		}
		const plan = this.progressMotion.update(fraction, now);
		if (plan !== this.motionPlan) {
			this.stopProgressAnimation();
			this.motionPlan = plan;
			if (plan) {
				this.progressAnimation = this.fill.animate(plan.fractions.map(value => ({ width: `${value * 100}%` })), {
					duration: plan.duration, easing: 'linear'
				});
			}
		}
	}

	private stopProgressAnimation(): void {
		this.progressAnimation?.cancel();
		this.progressAnimation = undefined;
		this.motionPlan = undefined;
	}

	/** Draw at most 120 measured samples, only while attached and visible. */
	private draw(): void {
		if (!this.data || !this.element.isConnected || this.element.hidden || this.width <= 0 || this.height <= 0) {
			return;
		}
		const ratio = Math.min(2, getWindow(this.element).devicePixelRatio || 1);
		const width = Math.round(this.width);
		const height = Math.round(this.height);
		if (this.drawn?.history === this.data.history && this.drawn.width === width && this.drawn.height === height
			&& this.drawn.ratio === ratio && this.drawn.theme === this.data.theme) {
			return;
		}
		if (this.canvas.width !== Math.round(width * ratio) || this.canvas.height !== Math.round(height * ratio)) {
			this.canvas.width = Math.round(width * ratio);
			this.canvas.height = Math.round(height * ratio);
		}
		const context = this.canvas.getContext('2d');
		if (!context) {
			return;
		}
		this.drawn = { history: this.data.history, width, height, ratio, theme: this.data.theme };
		if (!this.colors) {
			const style = getWindow(this.element).getComputedStyle(this.panel);
			this.colors = {
				accent: style.getPropertyValue('--turbofile-progress-accent').trim(),
				fill: style.getPropertyValue('--turbofile-progress-fill').trim(),
				grid: style.getPropertyValue('--turbofile-progress-grid').trim(),
				text: style.getPropertyValue('--turbofile-progress-label').trim()
			};
		}
		context.setTransform(ratio, 0, 0, ratio, 0, 0);
		context.clearRect(0, 0, width, height);
		context.font = '12px "Segoe UI", "Microsoft YaHei", sans-serif';
		const points = this.data.history;
		const maximum = Math.max(1024 * 1024, ...points.map(point => point.speedBytesPerSecond));
		const magnitude = 10 ** Math.floor(Math.log10(maximum));
		const ceiling = Math.ceil(maximum / magnitude / 2) * magnitude * 2;
		const left = Math.max(68, context.measureText(this.formatRate(ceiling)).width + 10);
		const top = 8;
		const right = Math.max(left + 1, width - 8);
		const bottom = Math.max(top + 1, height - 24);
		context.textAlign = 'right';
		context.textBaseline = 'middle';
		for (const fraction of [0, 0.5, 1]) {
			const y = bottom - fraction * (bottom - top);
			context.strokeStyle = this.colors.grid;
			context.lineWidth = 1;
			context.beginPath();
			context.moveTo(left, Math.round(y) + 0.5);
			context.lineTo(right, Math.round(y) + 0.5);
			context.stroke();
			context.fillStyle = this.colors.text;
			context.fillText(this.formatRate(ceiling * fraction), left - 8, y);
		}
		const last = points[points.length - 1]?.elapsedMs ?? 0;
		// Time, never completion percentage, determines the horizontal position.
		// Leave future time blank initially, then scroll the bounded history left.
		const span = TURBOFILE_TRANSFER_SPEED_HISTORY_WINDOW_MS;
		const first = Math.max(0, last - span);
		const x = (point: ITurboFileTransferSpeedPoint) => left + (point.elapsedMs - first) / span * (right - left);
		const y = (point: ITurboFileTransferSpeedPoint) => bottom - Math.min(1, point.speedBytesPerSecond / ceiling) * (bottom - top);
		if (points.length > 0) {
			context.save();
			context.beginPath();
			context.rect(left, top, right - left, bottom - top);
			context.clip();
			context.beginPath();
			context.moveTo(x(points[0]), bottom);
			for (const point of points) {
				context.lineTo(x(point), y(point));
			}
			context.lineTo(x(points[points.length - 1]), bottom);
			context.closePath();
			context.fillStyle = this.colors.fill;
			context.fill();
			context.beginPath();
			for (const [index, point] of points.entries()) {
				if (index === 0) {
					context.moveTo(x(point), y(point));
				} else {
					context.lineTo(x(point), y(point));
				}
			}
			context.strokeStyle = this.colors.accent;
			context.lineWidth = 1.5;
			context.stroke();
			context.restore();
		}
		context.fillStyle = this.colors.text;
		context.textAlign = 'left';
		context.fillText(localize('turbofile.progress.graphSeconds', "{0} 秒", Math.floor(first / 1000)), left, height - 7);
		context.textAlign = 'right';
		context.fillText(localize('turbofile.progress.graphSeconds', "{0} 秒", Math.floor((first + span) / 1000)), right, height - 7);
	}

	private setText(element: HTMLElement, text: string): void {
		if (element.textContent !== text) {
			element.textContent = text;
		}
	}

	override dispose(): void {
		this.stopProgressAnimation();
		this.element.remove();
		super.dispose();
	}
}
