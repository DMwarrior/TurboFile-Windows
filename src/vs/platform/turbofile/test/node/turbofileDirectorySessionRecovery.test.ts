/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as sinon from 'sinon';
import * as ts from 'typescript';
import { ITurboFileDirectoryListing, ITurboFileSshConnectionOptions } from '../../common/turbofile.js';
import { TurboFileKeyedGeneration } from '../../common/turbofileKeyedGeneration.js';
import { TurboFileOperationWatchdog } from '../../common/turbofileOperationWatchdog.js';
import { getRemoteDirectoryReadRetryDelay, REMOTE_DIRECTORY_READ_MAX_ATTEMPTS, shouldRetryRemoteDirectoryRead } from '../../common/turbofileRemoteDirectoryRetry.js';

class TestClient extends EventEmitter {
	ended = false;
	destroyed = false;

	end(): void {
		this.ended = true;
		this.emit('close');
	}

	destroy(): void {
		this.destroyed = true;
	}
}

class TestSftp {
	ended = false;

	end(): void {
		this.ended = true;
	}
}

interface ITestSession {
	readonly key: string;
	readonly generation: number;
	readonly client: TestClient;
	readonly sftp: TestSftp;
	closed: boolean;
}

interface IServiceHarness {
	readonly clients: TestClient[];
	readonly directorySftpSessions: Map<string, Promise<ITestSession>>;
	readonly readyDirectorySftpSessions: Map<string, ITestSession>;
	readonly directorySftpSessionGenerations: TurboFileKeyedGeneration;
	readonly directorySftpIdleTimers: Map<string, ReturnType<typeof setTimeout>>;
	readonly transferGrowthMonitoredProgressIds: Set<string>;
	reader: (client: TestClient, path: string) => Promise<ITurboFileDirectoryListing>;
	connectResult?: Promise<TestClient>;
	sftpResult?: Promise<TestSftp>;
	sftpError?: Error;
	openCalls: number;
	statCalls: number;
	listRemoteDirectoryCore(options: ITurboFileSshConnectionOptions, path: string, refresh: boolean, namesOnly: boolean): Promise<ITurboFileDirectoryListing>;
	createDirectorySftpSession(key: string, generation: number, config: object): Promise<ITestSession>;
	touchDirectorySftpSession(key: string, generation: number): void;
	disposeDirectorySftpSession(key: string, generation: number): void;
	beginTransferGrowthTiming(progressId: string | undefined, probeSize: () => Promise<number>, baselineSize?: number, expectedBytes?: number, onProgress?: (bytes: number) => void, pollIntervalMs?: number, initialDelayMs?: number, initialPollIntervalMs?: number, onActivity?: () => void): () => void;
	beginRemoteFileGrowthTiming(progressId: string | undefined, connection: ITurboFileSshConnectionOptions, path: string, baselineSize?: number, expectedBytes?: number, onProgress?: (bytes: number) => void): () => void;
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: Error) => void } {
	let resolve!: (value: T) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<T>((complete, fail) => {
		resolve = complete;
		reject = fail;
	});
	return { promise, resolve, reject };
}

/** Replay actual session and progress methods without loading Electron or touching devices. */
function createServiceHarness(): IServiceHarness {
	const servicePath = path.join(process.cwd(), 'src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts');
	const source = ts.createSourceFile(servicePath, fs.readFileSync(servicePath, 'utf8'), ts.ScriptTarget.Latest, true);
	const methodNames = new Set([
		'listRemoteDirectoryCore', 'getDirectorySftpSession', 'getReusableDirectorySftpSession',
		'createDirectorySftpSession', 'touchDirectorySftpSession', 'disposeDirectorySftpSession', 'clearDirectorySftpIdleTimer',
		'beginTransferGrowthTiming', 'normalizeGrowthProgressBytes', 'beginRemoteFileGrowthTiming'
	]);
	const methods: string[] = [];
	let abortDeclaration = '';
	const visit = (node: ts.Node): void => {
		if (ts.isMethodDeclaration(node) && methodNames.has(node.name.getText(source))) {
			methods.push(node.getText(source));
		}
		if (ts.isFunctionDeclaration(node) && node.name?.text === 'abortSshClientAndWait') {
			abortDeclaration = node.getText(source);
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
	assert.deepStrictEqual({ methods: methods.length, abortDeclaration: !!abortDeclaration }, { methods: methodNames.size, abortDeclaration: true });
	const code = ts.transpileModule(`
		const sshClientAbortPromises = new WeakMap();
		const sshOwnedProcessAbortGuards = new WeakMap();
		${abortDeclaration}
		class Harness {
			clients = [];
			directorySftpSessions = new Map();
			readyDirectorySftpSessions = new Map();
			directorySftpSessionGenerations = new TurboFileKeyedGeneration();
			directorySftpIdleTimers = new Map();
			directorySftpSessionLeaseCounts = new Map();
			remoteDirectoryListingCache = new Map();
			remoteDirectoryListingGenerations = new TurboFileKeyedGeneration();
			transferGrowthMonitoredProgressIds = new Set();
			openCalls = 0;
			statCalls = 0;
			reader = (_client, path) => Promise.resolve({ path, entries: [] });
			getDirectorySftpSessionKey() { return 'ssh'; }
			getRemoteDirectoryListingCacheKey(_options, path) { return path; }
			getRemoteDirectoryListingCache() { return undefined; }
			createConnectConfig() { return Promise.resolve({ ok: true, config: {} }); }
			connect() {
				if (this.connectResult) { return this.connectResult; }
				const client = new TestClient();
				this.clients.push(client);
				return Promise.resolve(client);
			}
			openSftp() { this.openCalls++; return this.sftpError ? Promise.reject(this.sftpError) : this.sftpResult ?? Promise.resolve(new TestSftp()); }
			readRemoteDirectoryWithFallback(_sftp, client, _options, path) { return this.reader(client, path); }
			rememberRemoteDirectory() {}
			createRemoteDirectoryListingResult(_key, _generation, _namesOnly, listing) { return listing; }
			remoteStat() { this.statCalls++; return Promise.resolve({ size: 42 }); }
			markTransferDataStarted() {}
			${methods.join('\n')}
		}`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
	const Harness: new () => IServiceHarness = new Function(
		'TurboFileKeyedGeneration', 'TestClient', 'TestSftp', 'getRemoteDirectoryReadRetryDelay', 'shouldRetryRemoteDirectoryRead',
		'REMOTE_DIRECTORY_READ_MAX_ATTEMPTS', 'REMOTE_DIRECTORY_SFTP_IDLE_MS', 'TRANSFER_PROGRESS_EVENT_INTERVAL_MS',
		'TRANSFER_INITIAL_GROWTH_POLL_INTERVAL_MS', 'delay', `${code}; return Harness;`
	)(TurboFileKeyedGeneration, TestClient, TestSftp, getRemoteDirectoryReadRetryDelay, shouldRetryRemoteDirectoryRead,
		REMOTE_DIRECTORY_READ_MAX_ATTEMPTS, 300000, 50, 50, (ms: number) => new Promise(resolve => setTimeout(resolve, ms)));
	return new Harness();
}

suite('TurboFileDirectorySessionRecovery', () => {
	const connection: ITurboFileSshConnectionOptions = { host: 'fixture', port: 22, username: 'fixture' };
	let clock: sinon.SinonFakeTimers;
	let harnesses: IServiceHarness[];
	const harness = (): IServiceHarness => {
		const service = createServiceHarness();
		harnesses.push(service);
		return service;
	};

	setup(() => {
		clock = sinon.useFakeTimers();
		harnesses = [];
	});

	teardown(async () => {
		for (const service of harnesses) {
			for (const [key, session] of service.readyDirectorySftpSessions) {
				service.disposeDirectorySftpSession(key, session.generation);
			}
		}
		await clock.tickAsync(0);
		clock.restore();
	});

	test('ordinary directory errors preserve the shared session and another in-flight listing', async () => {
		for (const message of ['Permission denied', 'No such file or directory']) {
			const service = harness();
			const normalRead = deferred<ITurboFileDirectoryListing>();
			service.reader = (client, remotePath) => {
				if (remotePath === '/denied') {
					return Promise.reject(new Error(message));
				}
				client.once('close', () => normalRead.reject(new Error('Connection closed during normal directory read.')));
				return normalRead.promise;
			};
			const normalListing = service.listRemoteDirectoryCore(connection, '/allowed', false, false);
			await clock.tickAsync(0);
			await assert.rejects(service.listRemoteDirectoryCore(connection, '/denied', false, true), new RegExp(message));
			normalRead.resolve({ path: '/allowed', entries: [] });
			assert.deepStrictEqual({ listing: await normalListing, clients: service.clients.length, ended: service.clients[0].ended }, {
				listing: { path: '/allowed', entries: [] }, clients: 1, ended: false
			});
		}
	});

	test('transport timeouts close the failed session and retry on a fresh connection', async () => {
		const service = harness();
		let reads = 0;
		service.reader = (_client, remotePath) => ++reads === 1
			? Promise.reject(new Error('Remote directory read timed out'))
			: Promise.resolve({ path: remotePath, entries: [] });
		const listing = service.listRemoteDirectoryCore(connection, '/allowed', false, false);
		await clock.tickAsync(100);
		assert.deepStrictEqual({ listing: await listing, reads, clients: service.clients.map(client => client.ended) }, {
			listing: { path: '/allowed', entries: [] }, reads: 2, clients: [true, false]
		});
	});

	test('a stale read failure cannot evict a replacement session generation', async () => {
		const service = harness();
		const oldRead = deferred<ITurboFileDirectoryListing>();
		let reads = 0;
		service.reader = (_client, remotePath) => ++reads === 1 ? oldRead.promise : Promise.resolve({ path: remotePath, entries: [] });
		const listing = service.listRemoteDirectoryCore(connection, '/allowed', false, false);
		await clock.tickAsync(0);
		const generation = service.directorySftpSessionGenerations.next('ssh');
		const replacement = await service.createDirectorySftpSession('ssh', generation, {});
		service.directorySftpSessions.set('ssh', Promise.resolve(replacement));
		service.readyDirectorySftpSessions.set('ssh', replacement);
		service.touchDirectorySftpSession('ssh', generation);
		oldRead.reject(new Error('Connection lost'));
		await clock.tickAsync(100);
		assert.deepStrictEqual({ listing: await listing, reads, current: service.readyDirectorySftpSessions.get('ssh') === replacement, ended: replacement.client.ended }, {
			listing: { path: '/allowed', entries: [] }, reads: 2, current: true, ended: false
		});
		service.clients[0].end();
	});

	test('a session borrowed after monitoring stopped regains its idle timer without being closed', async () => {
		const service = harness();
		const pendingSession = deferred<ITestSession>();
		const generation = service.directorySftpSessionGenerations.next('ssh');
		service.directorySftpSessions.set('ssh', pendingSession.promise);
		const progress: number[] = [];
		const stop = service.beginRemoteFileGrowthTiming('borrowed', connection, '/file', 0, 42, bytes => progress.push(bytes));
		await clock.tickAsync(0);
		stop();
		const shared = await service.createDirectorySftpSession('ssh', generation, {});
		pendingSession.resolve(shared);
		await clock.tickAsync(0);
		assert.deepStrictEqual({ ended: shared.client.ended, sftpEnded: shared.sftp.ended, idle: service.directorySftpIdleTimers.has('ssh'), statCalls: service.statCalls, progress }, {
			ended: false, sftpEnded: false, idle: true, statCalls: 0, progress: []
		});
	});

	test('a private connection arriving after monitoring stopped is closed before opening SFTP', async () => {
		const service = harness();
		const pendingClient = deferred<TestClient>();
		service.connectResult = pendingClient.promise;
		const progress: number[] = [];
		const stop = service.beginRemoteFileGrowthTiming('connecting', connection, '/file', 0, 42, bytes => progress.push(bytes));
		await clock.tickAsync(0);
		stop();
		const client = new TestClient();
		pendingClient.resolve(client);
		await clock.tickAsync(0);
		assert.deepStrictEqual({ ended: client.ended, destroyed: client.destroyed, openCalls: service.openCalls, statCalls: service.statCalls, progress, timers: clock.countTimers() }, {
			ended: true, destroyed: true, openCalls: 0, statCalls: 0, progress: [], timers: 0
		});
	});

	test('an SFTP handle arriving after monitoring stopped is closed without probing or progress', async () => {
		const service = harness();
		const pendingSftp = deferred<TestSftp>();
		service.sftpResult = pendingSftp.promise;
		const progress: number[] = [];
		const stop = service.beginRemoteFileGrowthTiming('opening', connection, '/file', 0, 42, bytes => progress.push(bytes));
		await clock.tickAsync(0);
		stop();
		const sftp = new TestSftp();
		pendingSftp.resolve(sftp);
		await clock.tickAsync(0);
		assert.deepStrictEqual({ ended: service.clients[0].ended, destroyed: service.clients[0].destroyed, sftpEnded: sftp.ended, statCalls: service.statCalls, progress, timers: clock.countTimers() }, {
			ended: true, destroyed: true, sftpEnded: true, statCalls: 0, progress: [], timers: 0
		});
	});

	test('growth without a UI progress ID keeps the internal stall watchdog alive', async () => {
		const service = harness();
		const transfer = deferred<void>();
		let aborts = 0;
		let reportActivity = () => { };
		let samples = 0;
		const watchdog = new TurboFileOperationWatchdog(() => aborts++);
		const pending = watchdog.run(report => { reportActivity = report; return transfer.promise; }, 3000, 'Transfer stalled');
		const stop = service.beginTransferGrowthTiming(undefined, async () => ++samples, 0, 0, () => reportActivity(), 1000, 0, 1000);
		try {
			await clock.tickAsync(10000);
			stop();
			transfer.resolve();
			await pending;
			await clock.tickAsync(1000);
			assert.deepStrictEqual({ aborts, samples, progressIds: service.transferGrowthMonitoredProgressIds.size, timers: clock.countTimers() }, {
				aborts: 0, samples: 11, progressIds: 0, timers: 0
			});
		} finally {
			stop();
			watchdog.fail(new Error('Fixture cleanup'));
			await pending.catch(() => undefined);
		}
	});

	test('every failed private SFTP monitor attempt releases its SSH connection before retry', async () => {
		const service = harness();
		service.sftpError = new Error('SFTP subsystem request failed');
		const stop = service.beginRemoteFileGrowthTiming('subsystem-failed', connection, '/file', 0, 42, () => undefined);
		try {
			await clock.tickAsync(50);
			stop();
			await clock.tickAsync(50);
			assert.deepStrictEqual({ clients: service.clients.map(client => ({ ended: client.ended, destroyed: client.destroyed })), openCalls: service.openCalls, statCalls: service.statCalls, timers: clock.countTimers() }, {
				clients: [{ ended: true, destroyed: true }, { ended: true, destroyed: true }], openCalls: 2, statCalls: 0, timers: 0
			});
		} finally {
			stop();
		}
	});

	test('an old target peak followed by truncation and new writes remains active beyond the timeout', async () => {
		const service = harness();
		const transfer = deferred<void>();
		let samples = 0;
		let activity = 0;
		let aborts = 0;
		let reportActivity = () => { };
		const displayed: number[] = [];
		const watchdog = new TurboFileOperationWatchdog(() => aborts++);
		const pending = watchdog.run(report => { reportActivity = report; return transfer.promise; }, 3000, 'Transfer stalled');
		const stop = service.beginTransferGrowthTiming('overwrite', async () => samples++ === 0 ? 10000 : (samples - 2) * 100,
			0, 10000, bytes => displayed.push(bytes), 1000, 0, 1000, () => { activity++; reportActivity(); });
		try {
			await clock.tickAsync(0);
			assert.strictEqual(activity, 0, 'Reading the old target is not write activity');
			await clock.tickAsync(1000);
			assert.strictEqual(activity, 1, 'Truncation to zero must be observed');
			await clock.tickAsync(9000);
			stop();
			transfer.resolve();
			await pending;
			await clock.tickAsync(1000);
			assert.deepStrictEqual({ aborts, activity, first: displayed[0], last: displayed.at(-1), timers: clock.countTimers() }, {
				aborts: 0, activity: 10, first: 10000, last: 900, timers: 0
			});
		} finally {
			stop();
			watchdog.fail(new Error('Fixture cleanup'));
			await pending.catch(() => undefined);
		}
	});

	test('a persistent old target does not keep a stalled transfer alive', async () => {
		const service = harness();
		let activity = 0;
		let aborts = 0;
		let reportActivity = () => { };
		const watchdog = new TurboFileOperationWatchdog(() => aborts++);
		const pending = assert.rejects(watchdog.run(report => { reportActivity = report; return new Promise<void>(() => undefined); }, 3000, 'Transfer stalled'), /Transfer stalled/);
		const stop = service.beginTransferGrowthTiming(undefined, async () => 10000, 0, 10000, undefined, 1000, 0, 1000, () => { activity++; reportActivity(); });
		try {
			await clock.tickAsync(3000);
			await pending;
			stop();
			await clock.tickAsync(1000);
			assert.deepStrictEqual({ activity, aborts, timers: clock.countTimers() }, { activity: 0, aborts: 1, timers: 0 });
		} finally {
			stop();
			watchdog.fail(new Error('Fixture cleanup'));
		}
	});

	test('baseline and expected-size caps cannot hide raw activity without a UI callback', async () => {
		for (const { baseline, expected } of [{ baseline: 20000, expected: 10000 }, { baseline: 0, expected: 1 }]) {
			const service = harness();
			const transfer = deferred<void>();
			let size = 10000;
			let activity = 0;
			let aborts = 0;
			let reportActivity = () => { };
			const watchdog = new TurboFileOperationWatchdog(() => aborts++);
			const pending = watchdog.run(report => { reportActivity = report; return transfer.promise; }, 3000, 'Transfer stalled');
			const stop = service.beginTransferGrowthTiming(undefined, async () => size++, baseline, expected, undefined, 1000, 0, 1000, () => { activity++; reportActivity(); });
			try {
				await clock.tickAsync(10000);
				stop();
				transfer.resolve();
				await pending;
				await clock.tickAsync(1000);
				assert.deepStrictEqual({ activity, aborts, progressIds: service.transferGrowthMonitoredProgressIds.size, timers: clock.countTimers() }, { activity: 10, aborts: 0, progressIds: 0, timers: 0 });
			} finally {
				stop();
				watchdog.fail(new Error('Fixture cleanup'));
				await pending.catch(() => undefined);
			}
		}
	});

	test('a probe resolved after stop cannot report activity or progress', async () => {
		const service = harness();
		const lateSize = deferred<number>();
		let calls = 0;
		let activity = 0;
		const displayed: number[] = [];
		const stop = service.beginTransferGrowthTiming(undefined, () => ++calls === 1 ? Promise.resolve(10000) : lateSize.promise,
			0, 10000, bytes => displayed.push(bytes), 1000, 0, 1000, () => activity++);
		await clock.tickAsync(1000);
		stop();
		lateSize.resolve(0);
		await clock.tickAsync(0);
		assert.deepStrictEqual({ calls, activity, displayed, timers: clock.countTimers() }, { calls: 2, activity: 0, displayed: [10000], timers: 0 });
	});
});
