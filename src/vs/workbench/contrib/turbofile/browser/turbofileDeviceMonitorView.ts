/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, EventType, getWindow } from '../../../../base/browser/dom.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { ITurboFileDeviceMonitorSnapshot } from '../../../../platform/turbofile/common/turbofileDeviceMonitor.js';
import { formatTurboFileMonitorCapacity, formatTurboFileMonitorCapacityPair } from '../common/turbofileDeviceMonitorDisplay.js';

export interface ITurboFileDeviceMonitorContext {
	readonly key: string;
	readonly label: string;
	readonly busy: boolean;
	read(): Promise<ITurboFileDeviceMonitorSnapshot>;
}

/** Small, static hardware outlines that inherit the status text color. */
function renderDeviceMetricIcon(kind: 'memory' | 'disk'): SVGElement {
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('viewBox', '0 0 16 16');
	svg.setAttribute('aria-hidden', 'true');
	svg.classList.add(`turbofile-device-monitor-${kind}-icon`);
	const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	path.setAttribute('d', kind === 'memory'
		? 'M1.5 3.5h13v7h-13zM4 5.5h2.5v3H4zM9.5 5.5H12v3H9.5zM4 10.5v2M8 10.5v2M12 10.5v2'
		: 'M4 3.5h8l2.5 6v3a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-3zM1.5 9.5h13M9.5 11.5h.01M12 11.5h.01');
	path.setAttribute('fill', 'none');
	path.setAttribute('stroke', 'currentColor');
	path.setAttribute('stroke-width', '1.25');
	path.setAttribute('stroke-linejoin', 'round');
	path.setAttribute('stroke-linecap', 'round');
	svg.append(path);
	return svg;
}

/** One small DOM island. It never re-renders a pane or writes telemetry to the task journal. */
export class TurboFileDeviceMonitorView extends Disposable {
	readonly element = $('.turbofile-device-monitor');
	private readonly name = $('span.turbofile-device-monitor-name');
	private readonly cpu = $('span.turbofile-device-monitor-metric.turbofile-device-monitor-cpu');
	private readonly memory = $('span.turbofile-device-monitor-metric.turbofile-device-monitor-memory');
	private readonly disk = $('span.turbofile-device-monitor-metric.turbofile-device-monitor-disk');
	private readonly cpuValue = $('span');
	private readonly memoryValue = $('span');
	private readonly diskValue = $('span');
	private readonly scheduler = this._register(new RunOnceScheduler(() => this.refresh(true), 5000));
	private key: string | undefined;
	private generation = 0;
	private pending = false;
	private stopped = false;
	private failures = 0;

	constructor(private readonly context: () => ITurboFileDeviceMonitorContext | undefined, owner: HTMLElement) {
		super();
		const cpuIcon = renderIcon(Codicon.chip);
		cpuIcon.setAttribute('aria-hidden', 'true');
		this.cpu.append(cpuIcon, this.cpuValue);
		this.memory.append(renderDeviceMetricIcon('memory'), this.memoryValue);
		this.disk.append(renderDeviceMetricIcon('disk'), this.diskValue);
		this.element.append(this.name, this.cpu, this.memory, this.disk);
		this.element.setAttribute('aria-live', 'off');
		this.element.hidden = true;
		this._register(addDisposableListener(this.element, EventType.CLICK, event => event.stopPropagation()));
		this._register(addDisposableListener(owner.ownerDocument, 'visibilitychange', () => this.refresh()));
		this._register(addDisposableListener(getWindow(owner), EventType.RESIZE, () => this.refresh()));
	}

	refresh(due = false): void {
		if (this.stopped) { return; }
		const context = this.context();
		if (!context || this.element.ownerDocument.hidden || getWindow(this.element).innerWidth < 700) {
			this.scheduler.cancel(); this.key = undefined; ++this.generation; this.element.hidden = true; return;
		}
		this.element.hidden = false;
		if (this.name.textContent !== context.label) { this.name.textContent = context.label; }
		if (context.key !== this.key) {
			this.key = context.key; ++this.generation; this.failures = 0; this.scheduler.cancel();
			this.name.textContent = context.label; this.cpuValue.textContent = 'CPU —'; this.memoryValue.textContent = localize('monitor.memoryPending', "内存 —"); this.diskValue.textContent = localize('monitor.diskPending', "磁盘 —");
			this.cpu.title = this.cpuValue.textContent; this.memory.title = this.memoryValue.textContent; this.disk.title = this.diskValue.textContent;
			this.disk.classList.remove('is-warning', 'is-critical'); this.element.classList.remove('is-unavailable');
			this.element.title = localize('monitor.loading', "{0}：正在读取设备信息", context.label);
		}
		if (this.pending || (!due && this.scheduler.isScheduled())) { return; }
		const generation = this.generation;
		this.pending = true;
		void context.read().then(snapshot => {
			if (this.stopped || generation !== this.generation) { return; }
			this.failures = snapshot.unavailable ? this.failures + 1 : 0;
			this.update(snapshot, context.label);
		}, () => {
			if (!this.stopped && generation === this.generation) { this.failures++; this.update({ sampledAt: 0, unavailable: true }, context.label); }
		}).finally(() => {
			this.pending = false;
			if (this.stopped || !this.key) { return; }
			if (generation !== this.generation) { this.refresh(); return; }
			const base = this.context()?.busy ? 15000 : 5000;
			this.scheduler.schedule(Math.min(base * 2 ** Math.min(this.failures, 4), 60000));
		});
	}

	private update(snapshot: ITurboFileDeviceMonitorSnapshot, label: string): void {
		this.element.classList.toggle('is-unavailable', !!snapshot.unavailable);
		this.cpuValue.textContent = `CPU ${snapshot.cpuPercent === undefined ? '—' : `${Math.round(snapshot.cpuPercent)}%`}`;
		this.memoryValue.textContent = snapshot.memoryTotal === undefined || snapshot.memoryUsed === undefined ? localize('monitor.memoryPending', "内存 —") : localize('monitor.memoryCapacity', "内存 {0}", formatTurboFileMonitorCapacityPair(snapshot.memoryUsed, snapshot.memoryTotal));
		this.diskValue.textContent = snapshot.disk ? localize('monitor.diskCapacity', "磁盘 {0}", formatTurboFileMonitorCapacityPair(snapshot.disk.used, snapshot.disk.total)) : localize('monitor.diskPending', "磁盘 —");
		this.cpu.title = this.cpuValue.textContent;
		this.memory.title = this.memoryValue.textContent;
		this.disk.title = snapshot.disk ? localize('monitor.diskCapacityDetail', "{0}\n占用 {1}% · 可用 {2}\n目录：{3}", this.diskValue.textContent, Math.round(snapshot.disk.percent), formatTurboFileMonitorCapacity(snapshot.disk.available), snapshot.disk.path) : this.diskValue.textContent;
		this.disk.classList.toggle('is-warning', !snapshot.unavailable && !!snapshot.disk && snapshot.disk.percent >= 80 && snapshot.disk.percent < 90);
		this.disk.classList.toggle('is-critical', !snapshot.unavailable && !!snapshot.disk && snapshot.disk.percent >= 90);
		this.element.title = [label, snapshot.unavailable ? localize('monitor.unavailable', "采集暂不可用，已暂停频繁重试；显示的是上次数据。") : localize('monitor.latest', "设备信息，仅保留最近一次采样"), snapshot.sampledAt ? localize('monitor.sampleTime', "采样时间：{0}", new Date(snapshot.sampledAt).toLocaleTimeString()) : '', snapshot.disk ? this.disk.title : '', snapshot.uptimeSeconds === undefined ? '' : localize('monitor.uptime', "已运行 {0} 天", (snapshot.uptimeSeconds / 86400).toFixed(1))].filter(Boolean).join('\n');
	}

	override dispose(): void { this.stopped = true; ++this.generation; super.dispose(); }
}
