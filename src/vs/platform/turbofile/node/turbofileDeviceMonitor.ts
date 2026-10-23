/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { promises as fs } from 'fs';
import { cpus, freemem, totalmem, uptime } from 'os';
import { Disposable } from '../../../base/common/lifecycle.js';
import { ITurboFileTransferEndpoint } from '../common/turbofile.js';
import { getTurboFileMonitorCpuPercent, ITurboFileDeviceMonitorSnapshot, parseTurboFileMonitorCpu, parseTurboFileMonitorDisk, parseTurboFileMonitorMemory, TURBOFILE_MONITOR_COMMAND } from '../common/turbofileDeviceMonitor.js';

export interface ITurboFileMonitorStream {
	on(event: 'data', listener: (chunk: Buffer | string) => void): unknown;
	on(event: 'close', listener: (code: number | null, signal: string | null) => void): unknown;
	on(event: 'error', listener: (error: Error) => void): unknown;
	close?(): void;
	destroy?(): void;
	stderr: { on(event: 'data', listener: (chunk: Buffer | string) => void): unknown };
}

export interface ITurboFileMonitorClient {
	exec(command: string, callback: (error: Error | undefined, stream: ITurboFileMonitorStream) => void): void;
	on(event: 'close', listener: () => void): unknown;
	on(event: 'error', listener: (error: Error) => void): unknown;
	off(event: 'close', listener: () => void): unknown;
	off(event: 'error', listener: (error: Error) => void): unknown;
	end(): void;
	destroy?(): void;
}

interface IMonitorEntry {
	client?: ITurboFileMonitorClient;
	pending?: Promise<ITurboFileDeviceMonitorSnapshot>;
	last?: ITurboFileDeviceMonitorSnapshot;
	pendingPath?: string;
	cpu?: readonly number[];
	readonly disks: Map<string, { readonly at: number; readonly disk?: ITurboFileDeviceMonitorSnapshot['disk'] }>;
	nextDiskAt: number;
	nextAt: number;
	failures: number;
	timer?: ReturnType<typeof setTimeout>;
	released: boolean;
}

/** A bounded executor for monitor-owned channels; never closes a directory or transfer session. */
export function execTurboFileMonitor(client: ITurboFileMonitorClient, command: string, timeoutMs = 3000): Promise<string> {
	return new Promise((resolve, reject) => {
		let settled = false;
		let stream: ITurboFileMonitorStream | undefined;
		let bytes = 0;
		let errorBytes = 0;
		const chunks: Buffer[] = [];
		const closeStream = (): void => { try { stream?.close?.(); stream?.destroy?.(); } catch { /* Owned channel cleanup. */ } };
		const finish = (error?: Error): void => {
			if (settled) { return; }
			settled = true; clearTimeout(timer); client.off('close', onClose); client.off('error', onError);
			if (error) { closeStream(); reject(error); } else { resolve(Buffer.concat(chunks, bytes).toString('utf8')); }
		};
		const onClose = (): void => finish(new Error('Monitor connection closed.'));
		const onError = (error: Error): void => finish(error);
		const timer = setTimeout(() => finish(new Error('Monitor command timed out.')), timeoutMs);
		client.on('close', onClose); client.on('error', onError);
		try {
			client.exec(command, (error, opened) => {
				stream = opened;
				if (settled) { closeStream(); return; }
				if (error) { finish(error); return; }
				stream.on('data', chunk => {
					if (settled) { return; }
					const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
					if (bytes + buffer.length > 16384) { finish(new Error('Monitor response exceeded its limit.')); return; }
					bytes += buffer.length; chunks.push(buffer);
				});
				stream.stderr.on('data', chunk => { errorBytes += Buffer.byteLength(chunk); if (errorBytes > 16384) { finish(new Error('Monitor error output exceeded its limit.')); } });
				stream.on('error', onError);
				stream.on('close', code => finish(code === 0 ? undefined : new Error('Monitor command unavailable.')));
			});
		} catch (error) { finish(error instanceof Error ? error : new Error(String(error))); }
	});
}

/** Latest samples only, shared per device. No polling occurs unless a visible view requests it. */
export class TurboFileDeviceMonitor extends Disposable {
	private readonly entries = new Map<string, IMonitorEntry>();
	private stopped = false;
	private localDiskPending = false;

	constructor(private readonly connect: (endpoint: ITurboFileTransferEndpoint, created: (client: ITurboFileMonitorClient) => void, canceled: () => boolean) => Promise<ITurboFileMonitorClient>, private readonly quotePath: (path: string) => string, private readonly now = Date.now) { super(); }

	sample(key: string, endpoint: ITurboFileTransferEndpoint): Promise<ITurboFileDeviceMonitorSnapshot> {
		if (this.stopped || endpoint.path.length > 4096 || endpoint.path.includes('\0')) { return Promise.resolve({ sampledAt: 0, unavailable: true }); }
		let entry = this.entries.get(key);
		if (!entry) {
			while (this.entries.size >= 4) { const oldest = this.entries.entries().next().value!; this.release(oldest[1]); this.entries.delete(oldest[0]); }
			entry = { disks: new Map(), nextDiskAt: 0, nextAt: 0, failures: 0, released: false }; this.entries.set(key, entry);
		}
		clearTimeout(entry.timer);
		entry.timer = setTimeout(() => { this.release(entry!); this.entries.delete(key); }, 30000);
		if (entry.pending) { return entry.pendingPath === endpoint.path ? entry.pending : entry.pending.then(() => this.sample(key, endpoint)); }
		const disk = entry.disks.get(endpoint.path);
		if (entry.last && this.now() < entry.nextAt && (entry.last.unavailable || (disk && this.now() - disk.at < 60000) || this.now() < entry.nextDiskAt)) {
			return Promise.resolve({ ...entry.last, disk: disk?.disk });
		}
		const current = entry;
		current.pendingPath = endpoint.path;
		current.pending = this.read(current, endpoint).finally(() => { current.pending = undefined; });
		return current.pending;
	}

	private async read(entry: IMonitorEntry, endpoint: ITurboFileTransferEndpoint): Promise<ITurboFileDeviceMonitorSnapshot> {
		let deadline: ReturnType<typeof setTimeout> | undefined;
		let active = true;
		try {
			const work = async (): Promise<ITurboFileDeviceMonitorSnapshot> => {
				let result: ITurboFileDeviceMonitorSnapshot;
				if (entry.last && !entry.last.unavailable && this.now() < entry.nextAt) {
					result = entry.last;
				} else {
					let cpu: readonly number[] | undefined;
					let values: Pick<ITurboFileDeviceMonitorSnapshot, 'memoryUsed' | 'memoryTotal' | 'uptimeSeconds'>;
					if (endpoint.kind === 'local') {
						const totals = [0, 0, 0, 0, 0];
						for (const core of cpus()) { const t = core.times; [t.user, t.nice, t.sys, t.idle, t.irq].forEach((value, index) => totals[index] += value); }
						cpu = [totals[0], totals[1], totals[2], totals[3], 0, totals[4]];
						const memoryTotal = totalmem(); values = { memoryTotal, memoryUsed: Math.max(0, memoryTotal - freemem()), uptimeSeconds: uptime() };
					} else {
						const client = entry.client ?? await this.connect(endpoint, client => { if (entry.released || !active) { client.destroy?.(); client.end(); } else { entry.client = client; } }, () => entry.released || !active);
						if (entry.released || !active) { client.destroy?.(); client.end(); throw new Error('Monitor released.'); }
						entry.client = client;
						const raw = await execTurboFileMonitor(client, TURBOFILE_MONITOR_COMMAND);
						if (!active || entry.released) { throw new Error('Monitor released.'); }
						cpu = parseTurboFileMonitorCpu(raw); values = parseTurboFileMonitorMemory(raw);
						if (!cpu || values.memoryTotal === undefined) { throw new Error('Unsupported monitor response.'); }
						const seconds = Number(/^TF_UPTIME\s+([\d.]+)/m.exec(raw)?.[1]);
						values = { ...values, uptimeSeconds: Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined };
					}
					result = { sampledAt: this.now(), ...values, cpuPercent: getTurboFileMonitorCpuPercent(entry.cpu, cpu) };
					entry.cpu = cpu;
				}
				const sampledAt = this.now();
				const cachedDisk = entry.disks.get(endpoint.path);
				let disk = cachedDisk?.disk;
				if ((!cachedDisk || sampledAt - cachedDisk.at >= 60000) && sampledAt >= entry.nextDiskAt) {
					entry.nextDiskAt = sampledAt + 5000;
					try {
						if (endpoint.kind === 'local') {
							const stat = await this.readLocalDisk(endpoint.path);
							const total = stat ? stat.blocks * stat.bsize : 0; const available = stat ? stat.bavail * stat.bsize : 0;
							const used = stat ? (stat.blocks - stat.bfree) * stat.bsize : 0;
							disk = stat && total > 0 ? { path: endpoint.path, total, used, available, percent: used * 100 / total } : undefined;
						} else { disk = parseTurboFileMonitorDisk(await execTurboFileMonitor(entry.client!, `LC_ALL=C df -Pk -- ${this.quotePath(endpoint.path)}`), endpoint.path); }
					} catch { /* A stalled filesystem must not invalidate CPU and memory readings. */ }
					if (active && !entry.released) {
						entry.disks.delete(endpoint.path);
						while (entry.disks.size >= 4) { entry.disks.delete(entry.disks.keys().next().value!); }
						entry.disks.set(endpoint.path, { at: sampledAt, disk });
					}
				}
				return { ...result, disk };
			};
			const result = await Promise.race([work(), new Promise<never>((_, reject) => { deadline = setTimeout(() => reject(new Error('Monitor deadline exceeded.')), 8000); })]);
			if (entry.released) { return { sampledAt: 0, unavailable: true }; }
			entry.failures = 0; entry.nextAt = result.sampledAt + 5000; entry.last = result;
			return result;
		} catch {
			this.closeClient(entry); entry.cpu = undefined; entry.failures++;
			entry.nextAt = this.now() + Math.min(5000 * 2 ** Math.min(entry.failures, 4), 60000);
			entry.last = { ...entry.last, disk: entry.disks.get(endpoint.path)?.disk, sampledAt: entry.last?.sampledAt ?? 0, unavailable: true };
			return entry.last;
		} finally { active = false; clearTimeout(deadline); }
	}

	private async readLocalDisk(path: string) {
		// A disconnected mapped drive can strand a non-cancelable native filesystem call.
		// Permit only one such call globally and bound how long the monitor waits for it.
		if (this.localDiskPending) { return undefined; }
		this.localDiskPending = true;
		const pending = fs.statfs(path).finally(() => { this.localDiskPending = false; });
		let timer: ReturnType<typeof setTimeout> | undefined;
		try { return await Promise.race([pending, new Promise<undefined>(resolve => { timer = setTimeout(() => resolve(undefined), 2000); })]); }
		finally { clearTimeout(timer); }
	}

	private closeClient(entry: IMonitorEntry): void { const client = entry.client; entry.client = undefined; try { client?.destroy?.(); client?.end(); } catch { /* Only monitor-owned connections. */ } }
	private release(entry: IMonitorEntry): void { entry.released = true; clearTimeout(entry.timer); this.closeClient(entry); }
	override dispose(): void { this.stopped = true; for (const entry of this.entries.values()) { this.release(entry); } this.entries.clear(); super.dispose(); }
}
