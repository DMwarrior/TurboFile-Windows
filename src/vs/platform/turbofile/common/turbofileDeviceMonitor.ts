/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// CPU delta and MemAvailable parsing adapted from electerm/electerm (MIT),
// src/client/components/remote-monitor/monitor-model.js at 9966f7ccc8645f89f9ecb59a15a075a7ed56ac49.
// Copyright (c) since 2017~ ZHAO Xudong <zxdong@gmail.com>. See ThirdPartyNotices.txt.

export interface ITurboFileDeviceMonitorSnapshot {
	readonly sampledAt: number;
	readonly unavailable?: boolean;
	readonly cpuPercent?: number;
	readonly memoryUsed?: number;
	readonly memoryTotal?: number;
	readonly uptimeSeconds?: number;
	readonly disk?: { readonly path: string; readonly total: number; readonly used: number; readonly available: number; readonly percent: number };
}

/** Raw counters only: no remote sleep, process enumeration, history or helper installation. */
export const TURBOFILE_MONITOR_COMMAND = "LC_ALL=C; export LC_ALL; test -r /proc/stat && test -r /proc/meminfo || exit 127; head -n 1 /proc/stat; grep -E '^(MemTotal|MemAvailable|MemFree):' /proc/meminfo; printf 'TF_UPTIME '; head -n 1 /proc/uptime";

export function parseTurboFileMonitorCpu(text: string): readonly number[] | undefined {
	const line = text.split(/\r?\n/).find(line => /^cpu\s/.test(line));
	const values = line?.trim().split(/\s+/).slice(1, 9).map(Number);
	return values && values.length >= 4 && values.every(value => Number.isFinite(value) && value >= 0) ? values : undefined;
}

export function getTurboFileMonitorCpuPercent(previous: readonly number[] | undefined, current: readonly number[] | undefined): number | undefined {
	if (!previous || !current || current.length !== previous.length) { return undefined; }
	const deltas = current.map((value, index) => value - previous[index]);
	if (deltas.some(value => !Number.isFinite(value) || value < 0)) { return undefined; }
	const total = deltas.reduce((sum, value) => sum + value, 0);
	if (total <= 0) { return undefined; }
	const idle = (deltas[3] || 0) + (deltas[4] || 0);
	return Math.max(0, Math.min(100, (total - idle) * 100 / total));
}

export function parseTurboFileMonitorMemory(text: string): Pick<ITurboFileDeviceMonitorSnapshot, 'memoryUsed' | 'memoryTotal'> {
	const values: Record<string, number> = {};
	for (const line of text.split(/\r?\n/)) {
		const match = /^(MemTotal|MemAvailable|MemFree):\s*(\d+)\s+kB\s*$/.exec(line);
		if (match) { values[match[1]] = Number(match[2]) * 1024; }
	}
	const total = values.MemTotal;
	const available = values.MemAvailable ?? values.MemFree;
	if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(available)) { return {}; }
	return { memoryTotal: total, memoryUsed: total - Math.max(0, Math.min(total, available)) };
}

export function parseTurboFileMonitorDisk(text: string, path: string): ITurboFileDeviceMonitorSnapshot['disk'] {
	for (const line of text.split(/\r?\n/)) {
		const match = /^.+?\s+(?<total>\d+)\s+(?<used>\d+)\s+(?<available>-?\d+)\s+(?<percent>\d+)%\s+.+$/.exec(line.trim());
		if (match?.groups) {
			const total = Number(match.groups.total) * 1024;
			const used = Number(match.groups.used) * 1024;
			const available = Number(match.groups.available) * 1024;
			const percent = Number(match.groups.percent);
			if (total > 0 && [total, used, available, percent].every(Number.isFinite)) { return { path, total, used, available, percent }; }
		}
	}
	return undefined;
}
