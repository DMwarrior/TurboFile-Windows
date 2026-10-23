/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { EventEmitter } from 'events';
import { DeferredPromise } from '../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ITurboFileTransferEndpoint } from '../../common/turbofile.js';
import { execTurboFileMonitor, ITurboFileMonitorClient, ITurboFileMonitorStream, TurboFileDeviceMonitor } from '../../node/turbofileDeviceMonitor.js';

class MonitorStream extends EventEmitter implements ITurboFileMonitorStream {
	readonly stderr = new EventEmitter();
	closed = 0;
	close(): void { this.closed++; }
	destroy(): void { this.closed++; }
}

class MonitorClient extends EventEmitter implements ITurboFileMonitorClient {
	readonly commands: string[] = [];
	closed = 0;
	baseSamples = 0;
	failBase = false;
	failDisk = false;
	open?: (error: Error | undefined, stream: ITurboFileMonitorStream) => void;
	manual = false;
	exec(command: string, callback: (error: Error | undefined, stream: ITurboFileMonitorStream) => void): void {
		this.commands.push(command);
		if (this.manual) { this.open = callback; return; }
		const stream = new MonitorStream();
		queueMicrotask(() => {
			callback(undefined, stream);
			const disk = command.includes('df -Pk');
			const value = disk ? 'Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/test 1000 200 800 20% /data' : `cpu ${100 + ++this.baseSamples * 10} 0 20 ${500 + this.baseSamples * 10} 0 0 0 0\nMemTotal: 1000 kB\nMemAvailable: 800 kB\nTF_UPTIME 86400.5 10.0`;
			stream.emit('data', value); stream.emit('close', (disk ? this.failDisk : this.failBase) ? 1 : 0, null);
		});
	}
	end(): void { this.closed++; }
	destroy(): void { this.closed++; }
}

const endpoint: ITurboFileTransferEndpoint = { kind: 'ssh', path: '/data' };
suite('TurboFile isolated device monitor', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let now: number;
	let connections: number;
	let client: MonitorClient;
	let monitor: TurboFileDeviceMonitor;
	setup(() => {
		now = 100000; connections = 0; client = new MonitorClient();
		monitor = disposables.add(new TurboFileDeviceMonitor(async (_endpoint, created) => { connections++; created(client); return client; }, value => `'${value.replace(/'/g, `'"'"'`)}'`, () => now));
	});

	test('coalesces concurrent consumers, reuses a connection and caches disk longer than CPU', async () => {
		const first = monitor.sample('server', endpoint); const concurrent = monitor.sample('server', endpoint);
		assert.strictEqual(first, concurrent);
		const initial = await first; const cached = await monitor.sample('server', endpoint);
		now += 6000; const next = await monitor.sample('server', endpoint);
		assert.deepStrictEqual([connections, cached.sampledAt === initial.sampledAt, client.commands.length, initial.cpuPercent, next.cpuPercent, next.memoryUsed, next.disk?.used, next.disk?.available], [1, true, 3, undefined, 50, 204800, 204800, 819200]);
	});

	test('serializes different directory requests and never reports the previous directory disk as current', async () => {
		const first = monitor.sample('server', endpoint); const second = monitor.sample('server', { ...endpoint, path: '/next path' });
		await first; const provisional = await second;
		const initialCommands = client.commands.length;
		now += 6000; const result = await monitor.sample('server', { ...endpoint, path: '/next path' });
		assert.deepStrictEqual([provisional.disk, initialCommands, result.disk?.path, client.commands.filter(command => command.includes('df -Pk')).length, client.commands[3].endsWith("'/next path'")], [undefined, 2, '/next path', 2, true]);
	});

	test('rapid directory changes reuse CPU samples and bound disk probes across paths', async () => {
		await monitor.sample('server', endpoint);
		for (let index = 0; index < 20; index++) { await monitor.sample('server', { ...endpoint, path: `/other-${index}` }); }
		now += 6000; await monitor.sample('server', { ...endpoint, path: '/other-19' });
		await monitor.sample('server', endpoint);
		assert.deepStrictEqual([connections, client.baseSamples, client.commands.filter(command => command.includes('df -Pk')).length], [1, 2, 2]);
	});

	test('keeps CPU and memory when disk querying fails, and does not hammer that filesystem', async () => {
		client.failDisk = true;
		const initial = await monitor.sample('server', endpoint); now += 6000; const second = await monitor.sample('server', endpoint);
		assert.deepStrictEqual([initial.unavailable, second.memoryTotal, second.cpuPercent, second.disk, client.commands.filter(command => command.includes('df -Pk')).length], [undefined, 1024000, 50, undefined, 1]);
	});

	test('backs off errors, closes only the owned monitor client, and keeps counters honest on recovery', async () => {
		client.failBase = true;
		const failed = await monitor.sample('server', endpoint); now += 5000; await monitor.sample('server', endpoint);
		const before = connections; client.failBase = false; now += 6000;
		const recovered = await monitor.sample('server', endpoint);
		assert.deepStrictEqual([failed.unavailable, before, connections, client.closed > 0, recovered.unavailable, recovered.cpuPercent], [true, 1, 2, true, undefined, undefined]);
	});

	test('never labels the last directory disk as belonging to a new path during error backoff', async () => {
		await monitor.sample('server', endpoint); client.failBase = true; now += 6000;
		await monitor.sample('server', endpoint);
		const result = await monitor.sample('server', { ...endpoint, path: '/different-mount' });
		assert.deepStrictEqual([result.unavailable, result.disk], [true, undefined]);
	});

	test('disposal closes a connection that arrives after the view has gone away', async () => {
		const ready = new DeferredPromise<ITurboFileMonitorClient>(); let created: ((client: ITurboFileMonitorClient) => void) | undefined;
		const delayed = disposables.add(new TurboFileDeviceMonitor(async (_endpoint, callback) => { created = callback; return ready.p; }, path => path));
		const sample = delayed.sample('late', endpoint); delayed.dispose(); created!(client); await ready.complete(client);
		const result = await sample;
		assert.deepStrictEqual([result.unavailable, client.commands.length, client.closed > 0], [true, 0, true]);
	});

	test('bounds retained devices and releases evicted monitor connections', async () => {
		const clients: MonitorClient[] = [];
		const bounded = disposables.add(new TurboFileDeviceMonitor(async (_endpoint, created) => { const next = new MonitorClient(); clients.push(next); created(next); return next; }, path => path));
		for (let index = 0; index < 5; index++) { await bounded.sample(`server-${index}`, endpoint); }
		assert.deepStrictEqual(clients.map(connection => connection.closed > 0), [true, false, false, false, false]);
	});

	test('local sampling needs no SSH process or connection', async () => {
		const result = await monitor.sample('local', { kind: 'local', path: process.cwd() });
		assert.ok(connections === 0 && result.memoryTotal! > 0 && result.uptimeSeconds! > 0 && !result.unavailable);
	});

	test('bounds output and removes connection listeners after failure', async () => {
		client.manual = true;
		const result = execTurboFileMonitor(client, 'read bounded values'); const stream = new MonitorStream(); client.open!(undefined, stream);
		stream.emit('data', Buffer.alloc(16385));
		await assert.rejects(result, /limit/);
		assert.deepStrictEqual([client.listenerCount('close'), client.listenerCount('error'), stream.closed > 0], [0, 0, true]);
	});

	test('times out a missing channel grant and closes a late channel', async () => {
		client.manual = true;
		await assert.rejects(execTurboFileMonitor(client, 'stalled channel', 10), /timed out/);
		const late = new MonitorStream(); client.open!(undefined, late);
		assert.deepStrictEqual([client.listenerCount('close'), client.listenerCount('error'), late.closed > 0], [0, 0, true]);
	});
});
