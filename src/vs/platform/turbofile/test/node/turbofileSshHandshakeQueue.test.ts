/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import { TurboFileSshHandshakeQueue } from '../../node/turbofileSshHandshakeQueue.js';

class TransferCanceledError extends Error { }

interface IConfig {
	readonly host: string;
	readonly port?: number;
	readonly username?: string;
}

interface IConnectionHarness {
	connect(config: IConfig, progressId?: string): Promise<EventEmitter>;
	readonly sshHandshakeQueue: TurboFileSshHandshakeQueue;
	readonly canceled: Set<string>;
	readonly handlers: Map<string, Set<() => void | Promise<void>>>;
}

function createHarness(): { service: IConnectionHarness; clients: EventEmitter[]; aborts: EventEmitter[] } {
	const clients: EventEmitter[] = [];
	const aborts: EventEmitter[] = [];
	class Client extends EventEmitter {
		connect(config: IConfig): void {
			clients.push(this);
			if (config.username === 'sync-throw') { throw new Error('connect threw'); }
		}
	}
	const servicePath = path.join(process.cwd(), 'src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts');
	const source = ts.createSourceFile(servicePath, fs.readFileSync(servicePath, 'utf8'), ts.ScriptTarget.Latest, true);
	let method: string | undefined;
	const visit = (node: ts.Node): void => {
		if (ts.isMethodDeclaration(node) && node.name.getText(source) === 'connect') { method = node.getText(source); }
		ts.forEachChild(node, visit);
	};
	visit(source);
	assert.ok(method);
	const code = ts.transpileModule(`class Harness {
		sshHandshakeQueue = new TurboFileSshHandshakeQueue();
		sshConnectionConfigs = new WeakMap();
		canceled = new Set(); handlers = new Map();
		async getNativeRequire() { return () => ({ Client }); }
		isTransferCanceled(id) { return this.canceled.has(id); }
		throwIfTransferCanceled(id) { if (this.isTransferCanceled(id)) throw new TurboFileTransferCanceledError(); }
		registerTransferCancelHandler(id, callback) {
			if (!id) return () => {};
			let handlers = this.handlers.get(id);
			if (!handlers) { handlers = new Set(); this.handlers.set(id, handlers); }
			handlers.add(callback);
			return () => { handlers.delete(callback); if (!handlers.size) this.handlers.delete(id); };
		}
		${method}
	}`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
	const Harness: new () => IConnectionHarness = new Function('TurboFileSshHandshakeQueue', 'TurboFileTransferCanceledError', 'Client', 'abortSshClientAndWait', `${code}; return Harness;`)(
		TurboFileSshHandshakeQueue, TransferCanceledError, Client,
		async (client: EventEmitter) => { aborts.push(client); client.emit('close'); }
	);
	return { service: new Harness(), clients, aborts };
}

async function flush(): Promise<void> {
	await new Promise<void>(resolve => setImmediate(resolve));
}

function assertIdle(service: IConnectionHarness): void {
	assert.strictEqual((service.sshHandshakeQueue as unknown as { hosts: Map<string, unknown> }).hosts.size, 0);
	assert.strictEqual(service.handlers.size, 0);
}

suite('TurboFileSshHandshakeQueue', () => {
	test('a cold batch has four handshakes per host and authenticated streams do not occupy slots', async () => {
		const { service, clients } = createHarness();
		const requests = Array.from({ length: 12 }, (_, index) => service.connect({ host: index % 2 ? ' SERVER ' : 'server', username: `user-${index}` }, `task-${index}`));
		requests.push(service.connect({ host: 'other-server' }, 'other-host'));
		requests.push(service.connect({ host: 'server', port: 2222 }, 'other-port'));
		await flush();
		assert.strictEqual(clients.length, 6);
		let ready = 0;
		while (ready < requests.length) {
			const currentCount = clients.length;
			for (; ready < currentCount; ready++) { clients[ready].emit('ready'); }
			await flush();
		}
		await Promise.all(requests);
		// No close events were needed: all fourteen connections can remain open.
		assertIdle(service);
	});

	test('canceling a queued request rejects immediately without constructing its socket', async () => {
		const { service, clients } = createHarness();
		const requests = Array.from({ length: 8 }, (_, index) => service.connect({ host: 'server' }, `task-${index}`));
		const canceled = assert.rejects(requests[4], TransferCanceledError);
		await flush();
		service.canceled.add('task-4');
		await Promise.all([...service.handlers.get('task-4')!].map(callback => callback()));
		await canceled;
		assert.strictEqual(clients.length, 4);
		let ready = 0;
		while (ready < 7) {
			const currentCount = clients.length;
			for (; ready < currentCount; ready++) { clients[ready].emit('ready'); }
			await flush();
		}
		await Promise.all(requests.filter((_, index) => index !== 4));
		assert.strictEqual(clients.length, 7);
		assertIdle(service);
	});

	for (const failure of ['error', 'close', 'sync-throw'] as const) {
		test(`${failure} releases one slot and late close cannot release it twice`, async () => {
			const { service, clients } = createHarness();
			const failed = service.connect({ host: 'server', username: failure === 'sync-throw' ? failure : 'user' }, 'failed');
			const rejected = assert.rejects(failed, /connect threw|reset|closed before authentication/);
			const requests = Array.from({ length: 5 }, (_, index) => service.connect({ host: 'server' }, `task-${index}`));
			await flush();
			if (failure !== 'sync-throw') {
				assert.strictEqual(clients.length, 4);
				if (failure === 'error') { clients[0].emit('error', new Error('reset')); }
				else { clients[0].emit('close'); }
			}
			await rejected;
			await flush();
			assert.strictEqual(clients.length, 5);
			clients[0].emit('close');
			await flush();
			assert.strictEqual(clients.length, 5);
			for (let index = 1; index < 6; index++) {
				clients[index].emit('ready');
				await flush();
			}
			await Promise.all(requests);
			assertIdle(service);
		});
	}

	test('canceling an active handshake aborts it and lets the next request start', async () => {
		const { service, clients, aborts } = createHarness();
		const requests = Array.from({ length: 5 }, (_, index) => service.connect({ host: 'server' }, `task-${index}`));
		const canceled = assert.rejects(requests[0], TransferCanceledError);
		await flush();
		service.canceled.add('task-0');
		await Promise.all([...service.handlers.get('task-0')!].map(callback => callback()));
		await canceled;
		await flush();
		assert.strictEqual(aborts.length, 1);
		assert.strictEqual(clients.length, 5);
		for (const client of clients.slice(1)) { client.emit('ready'); }
		await Promise.all(requests.slice(1));
		assertIdle(service);
	});

	test('already canceled requests consume no slot and releases are idempotent', async () => {
		const queue = new TurboFileSshHandshakeQueue();
		const controller = new AbortController();
		controller.abort(new Error('already canceled'));
		await assert.rejects(queue.acquire('server', 22, controller.signal), /already canceled/);
		const release = await queue.acquire('server', 22, new AbortController().signal);
		release();
		release();
		assert.strictEqual((queue as unknown as { hosts: Map<string, unknown> }).hosts.size, 0);
	});
});
