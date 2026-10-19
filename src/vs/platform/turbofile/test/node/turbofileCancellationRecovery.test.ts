/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { Duplex, PassThrough } from 'stream';
import { pipeline } from 'stream/promises';
import { randomUUID } from 'crypto';
import * as sinon from 'sinon';
import * as ts from 'typescript';
import { localize } from '../../../../nls.js';
import { ITurboFileFileOperationResult, ITurboFileSshConnectionOptions } from '../../common/turbofile.js';
import { TurboFileOperationWatchdog } from '../../common/turbofileOperationWatchdog.js';
import { withTurboFileTimeout } from '../../common/turbofileTimeout.js';

/** A broken transport can stop emitting close/error as well as its request callbacks. */
class SilentClient extends EventEmitter {
	ended = false;
	destroyed = false;
	execCallback: ((error: Error | undefined, stream: CommandStream | ScpStream) => void) | undefined;
	unforwardCallback: ((error: Error | undefined) => void) | undefined;
	forwardCallback: ((error: Error | undefined, port: number) => void) | undefined;

	exec(_command: string, callback: (error: Error | undefined, stream: CommandStream | ScpStream) => void): void {
		this.execCallback = callback;
		this.emit('execRequested');
	}

	unforwardIn(_host: string, _port: number, callback: (error: Error | undefined) => void): void {
		this.unforwardCallback = callback;
	}

	forwardIn(_host: string, _port: number, callback: (error: Error | undefined, port: number) => void): void {
		this.forwardCallback = callback;
	}

	end(): void {
		this.ended = true;
	}

	destroy(): void {
		this.destroyed = true;
	}
}

class SilentSftp extends EventEmitter {
	ended = false;
	statCallback: ((error: Error | undefined, stat: { size: number }) => void) | undefined;
	transferOptions: ITransferOptions | undefined;
	transferCallback: ((error: Error | undefined) => void) | undefined;

	stat(_remotePath: string, callback: (error: Error | undefined, stat: { size: number }) => void): void {
		this.statCallback = callback;
	}

	fastPut(_local: string, _remote: string, options: ITransferOptions, callback: (error: Error | undefined) => void): void {
		this.transferOptions = options;
		this.transferCallback = callback;
	}

	end(): void {
		this.ended = true;
	}
}

class CommandStream extends PassThrough {
	readonly stderr = new PassThrough();
	closeRequested = false;

	constructor() {
		super({ emitClose: false });
	}

	close(): void {
		this.closeRequested = true;
	}
}

class CommandProcess extends EventEmitter {
	readonly stdout = new PassThrough();
	readonly stderr = new PassThrough();
	readonly stdin = new PassThrough();
}

/** Writes are accepted, but the peer never replies or emits close. */
class ScpStream extends Duplex {
	readonly stderr = new PassThrough();

	constructor() {
		super({ emitClose: false });
	}

	override _read(): void { }

	override _write(_chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
		callback();
	}

	close(): void { }
}

interface ISession {
	readonly client: SilentClient;
	readonly sftp: SilentSftp;
}

interface ICommandResult {
	readonly stream: CommandStream;
	readonly close: Promise<void>;
}

interface ILocalTool {
	readonly executable: string;
	readonly env: NodeJS.ProcessEnv;
}

interface ITransferOptions {
	readonly step?: (totalTransferred: number, chunk: number, total: number) => void;
}

interface IServiceHarness {
	installGuard(client: SilentClient, guard: () => Promise<void>): void;
	abortClient(client: SilentClient): Promise<void>;
	readonly transferCancelHandlers: Map<string, Set<() => void | Promise<void>>>;
	readonly transferCancellationRequests: Set<string>;
	readonly recentlyCanceledTransfers: Map<string, number>;
	cancelTransfer(progressId: string): Promise<ITurboFileFileOperationResult>;
	isTransferCanceled(progressId: string): boolean;
	clearTaskCancellation(progressId: string): void;
	registerTransferCancelHandler(progressId: string, handler: () => void | Promise<void>): () => void;
	abortDirectorySftpSessionAndWait(session: ISession): Promise<void>;
	getSftpOperationWatchdog(sftp: SilentSftp, client: SilentClient): TurboFileOperationWatchdog;
	remoteStat(sftp: SilentSftp, remotePath: string): Promise<{ size: number }>;
	fastPut(sftp: SilentSftp, localPath: string, remotePath: string, options: ITransferOptions): Promise<void>;
	createSftpTransferOptions(onDelta: (delta: number) => void, progressId: string): ITransferOptions;
	forwardIn(client: SilentClient, host: string, port: number, progressId?: string): Promise<number>;
	unforwardIn(client: SilentClient, host: string, port: number): Promise<void>;
	openRemoteCommandStream(client: SilentClient, command: string, context: string, drainStdout: boolean, progressId: string): Promise<ICommandResult>;
	execRemoteWithInput(client: SilentClient, command: string, input: Uint8Array, options?: { progressId?: string; inactivityTimeoutMs?: number; getActivityTime?: () => number; onStderr?: (chunk: string) => void; onExit?: () => void; beforeAbort?: () => Promise<void> }): Promise<Buffer>;
	relayRemoteStreamsWithWatchdog(source: ICommandResult, target: ICommandResult, onDelta: (delta: number) => void, progressId: string): Promise<void>;
	runNativeLocalTarUpload(tarArgs: string[], connection: ITurboFileSshConnectionOptions, command: string, progressId: string): Promise<void>;
	runNativeLocalTarUploadChunk(localRoot: string, chunk: { listPath: string }, connection: ITurboFileSshConnectionOptions, tool: ILocalTool, command: string, progressId: string): Promise<void>;
	runNativeLocalTarZstdUploadChunk(localRoot: string, chunk: { listPath: string }, connection: ITurboFileSshConnectionOptions, ssh: ILocalTool, zstd: ILocalTool, command: string, progressId: string): Promise<void>;
	runCancelableLocalCommand(command: string, args: string[], options: object, progressId: string): Promise<void>;
	pipeNativeTarDownload(sshProcess: CommandProcess, tarArgs: string[], progressId: string, onDelta?: (delta: number) => void, remoteInput?: Uint8Array): Promise<void>;
	pipeRemoteTarDownload(config: object, command: string, tarArgs: string[], progressId: string): Promise<void>;
	uploadFileWithScpProtocolOnClient(client: SilentClient, command: string, localPath: string, remotePath: string, expectedBytes: number, onProgress: ((bytes: number) => void) | undefined, progressId: string): Promise<void>;
	downloadFileWithScpProtocolOnClient(client: SilentClient, command: string, localPath: string, expectedBytes: number, onProgress: ((bytes: number) => void) | undefined, progressId: string): Promise<void>;
}

/** Run actual service methods against controllable transports without Electron side effects. */
function createServiceHarness(charsetProbe: Promise<string[]> = Promise.resolve([]), onSpawn: () => CommandProcess = () => { throw new Error('Unexpected process spawn.'); }, testClient = new SilentClient()): IServiceHarness {
	const servicePath = path.join(process.cwd(), 'src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts');
	const source = ts.createSourceFile(servicePath, fs.readFileSync(servicePath, 'utf8'), ts.ScriptTarget.Latest, true);
	const methodNames = new Set([
		'cancelTransfer', 'registerTransferCancelHandler', 'isTransferCanceled', 'throwIfTransferCanceled', 'clearTaskCancellation',
		'abortDirectorySftpSessionAndWait', 'getSftpOperationWatchdog', 'remoteStat', 'forwardIn', 'unforwardIn',
		'fastPut', 'createSftpTransferOptions',
		'openRemoteCommandStream', 'relayRemoteStreamsWithWatchdog', 'runNativeTransferWithWatchdog', 'runNativeLocalTarUpload',
		'runNativeLocalTarUploadChunk', 'runNativeLocalTarZstdUploadChunk', 'runCancelableLocalCommand',
		'pipeNativeTarDownload', 'pipeRemoteTarDownload', 'uploadFileWithScpProtocolOnClient',
		'downloadFileWithScpProtocolOnClient', 'openScpExec', 'waitForTransferSession', 'execRemoteWithInput'
	]);
	const declarationNames = new Set([
		'TurboFileTransferCanceledError', 'abortSshClientAndWait', 'abortSshExecStreamAndWait',
		'createProgressPassThrough', 'writeInputToWritableStream', 'formatLocalCommandError',
		'ScpProtocolReader', 'readScpResponse', 'readScpFileHeader', 'writeScpData', 'waitForScpClose',
		'ensureLocalParentDirectory', 'ensureLocalDirectory', 'isLocalFilesystemRoot', 'formatScpMode', 'sanitizeScpFileName'
	]);
	const methods: string[] = [];
	const declarations: string[] = [];
	const constantNames = new Set([
		'SFTP_LARGE_FILE_THRESHOLD', 'SFTP_LARGE_TRANSFER_CONCURRENCY', 'SFTP_TRANSFER_CONCURRENCY',
		'SFTP_COMPAT_TRANSFER_CONCURRENCY', 'SFTP_LARGE_TRANSFER_CHUNK_SIZE', 'SFTP_TRANSFER_CHUNK_SIZE',
		'SFTP_COMPAT_TRANSFER_CHUNK_SIZE', 'DIRECT_TRANSFER_STALL_CHECK_INTERVAL_MS', 'WARM_SCP_TARGET_DIRECTORY_CONFLICT_MARKER'
	]);
	const constants: string[] = [];
	const visit = (node: ts.Node): void => {
		if (ts.isMethodDeclaration(node) && methodNames.has(node.name.getText(source))) {
			methods.push(node.getText(source));
		}
		if ((ts.isClassDeclaration(node) || ts.isFunctionDeclaration(node)) && node.name && declarationNames.has(node.name.text)) {
			declarations.push(node.getText(source));
		}
		if (ts.isVariableDeclaration(node) && constantNames.has(node.name.getText(source))) {
			constants.push(`const ${node.getText(source)};`);
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
	assert.deepStrictEqual({ methods: methods.length, declarations: declarations.length }, { methods: methodNames.size, declarations: declarationNames.size });
	const code = ts.transpileModule(`
		const sshClientAbortPromises = new WeakMap();
		const sshExecStreamAbortPromises = new WeakMap();
		const sshOwnedProcessAbortGuards = new WeakMap();
		const formatTransferError = error => error.message;
		const SCP_EXEC_DIAGNOSTICS = new WeakMap();
		${constants.join('\n')}
		${declarations.join('\n')}
		class Harness {
			installGuard(client, guard) { sshOwnedProcessAbortGuards.set(client, new Set([guard])); }
			abortClient(client) { return abortSshClientAndWait(client); }
			transferCancellationRequests = new Set();
			recentlyCanceledTransfers = new Map();
			transferCancelHandlers = new Map();
			sftpOperationWatchdogs = new WeakMap();
			getLocalTarCharsetArgs() { return charsetProbe; }
			connect() { return Promise.resolve(testClient); }
			${methods.join('\n')}
		}`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
	const Harness: new () => IServiceHarness = new Function(
		'TurboFileOperationWatchdog', 'withTurboFileTimeout', 'localize', 'PassThrough', 'pipeline', 'charsetProbe', 'spawn', 'testClient',
		'resolveLocalSshTool', 'withNativeOpenSshArgs', 'waitForLocalProcessClose', 'killLocalProcessTree',
		'SFTP_REQUEST_TIMEOUT_MS', 'REMOTE_FILE_TRANSFER_INACTIVITY_TIMEOUT_MS',
		'REMOTE_DIRECTORY_TRANSFER_INACTIVITY_TIMEOUT_MS', 'REMOTE_EXEC_CHANNEL_OPEN_TIMEOUT_MS',
		'TRANSFER_CANCELED_MESSAGE', 'LOCAL_TAR_ZSTD_LEVEL',
		'fsp', 'dirname', 'randomUUID',
		`${code}; return Harness;`
	)(TurboFileOperationWatchdog, withTurboFileTimeout, localize, PassThrough, pipeline, charsetProbe, onSpawn, testClient,
		async () => ({ executable: 'ssh', env: {} }),
		async (_connection: ITurboFileSshConnectionOptions, _tool: ILocalTool, _command: string, task: (args: string[], env: NodeJS.ProcessEnv) => Promise<void>) => task([], {}),
		() => new Promise<void>(() => undefined), async () => undefined,
		30000, 120000, 600000, 30000, 'Transfer canceled.', 1,
		fs.promises, path.dirname, randomUUID);
	return new Harness();
}

suite('TurboFileCancellationRecovery', () => {
	let clock: sinon.SinonFakeTimers;

	setup(() => {
		clock = sinon.useFakeTimers();
	});

	teardown(() => {
		clock.restore();
	});

	test('concurrent client abort handlers wait for one owned-process confirmation before disconnecting', async () => {
		const service = createServiceHarness();
		const client = new SilentClient();
		let release!: () => void;
		const confirmation = new Promise<void>(resolve => release = resolve);
		let calls = 0;
		service.installGuard(client, async () => { calls++; await confirmation; });
		const first = service.abortClient(client);
		const second = service.abortClient(client);
		await clock.tickAsync(100);
		assert.deepStrictEqual({ calls, ended: client.ended, destroyed: client.destroyed }, { calls: 1, ended: false, destroyed: false });
		release();
		await clock.tickAsync(3000);
		await Promise.all([first, second]);
		assert.strictEqual(client.destroyed, true);
	});

	test('an unconfirmed cancellation keeps the client usable and can be retried', async () => {
		const service = createServiceHarness();
		const client = new SilentClient();
		let confirmed = false;
		service.installGuard(client, async () => { if (!confirmed) { throw new Error('Stop could not be confirmed.'); } });
		service.registerTransferCancelHandler('owned', () => service.abortClient(client));
		assert.deepStrictEqual(await service.cancelTransfer('owned'), { ok: false, message: 'Stop could not be confirmed.' });
		assert.deepStrictEqual({ canceled: service.isTransferCanceled('owned'), destroyed: client.destroyed }, { canceled: false, destroyed: false });
		confirmed = true;
		const canceled = service.cancelTransfer('owned');
		await clock.tickAsync(3000);
		assert.strictEqual((await canceled).ok, true);
		assert.strictEqual(client.destroyed, true);
	});

	test('cancel rejects a pending SFTP request even when transport close events are lost', async () => {
		const service = createServiceHarness();
		const client = new SilentClient();
		const sftp = new SilentSftp();
		const monitor = service.getSftpOperationWatchdog(sftp, client);
		let requestSettled = false;
		const request = service.remoteStat(sftp, '/fixture').then(() => requestSettled = true, () => requestSettled = true);
		service.registerTransferCancelHandler('sftp-task', () => service.abortDirectorySftpSessionAndWait({ client, sftp }));
		const canceled = service.cancelTransfer('sftp-task');
		await clock.tickAsync(3000);
		await canceled;
		try {
			assert.deepStrictEqual({ requestSettled, ended: sftp.ended, destroyed: client.destroyed, timers: clock.countTimers() }, { requestSettled: true, ended: true, destroyed: true, timers: 0 });
		} finally {
			monitor.fail(new Error('Fixture cleanup.'));
			await request;
		}
	});

	test('cancel during an exec channel grant releases the command and cleans a late grant', async () => {
		const service = createServiceHarness();
		const client = new SilentClient();
		const pending = assert.rejects(service.openRemoteCommandStream(client, 'fixture', 'fixture stream', false, 'exec-task'), /canceled/i);
		const canceled = service.cancelTransfer('exec-task');
		await clock.tickAsync(3000);
		await Promise.all([pending, canceled]);
		const lateStream = new CommandStream();
		client.execCallback?.(undefined, lateStream);
		assert.deepStrictEqual({ destroyed: lateStream.destroyed, closeRequested: lateStream.closeRequested, handlers: service.transferCancelHandlers.size, timers: clock.countTimers() }, { destroyed: true, closeRequested: true, handlers: 0, timers: 0 });
	});

	test('cancel a silent tar relay without depending on pipeline or stream close completion', async () => {
		const service = createServiceHarness();
		const sourceStream = new CommandStream();
		const targetStream = new CommandStream();
		const neverCloses = new Promise<void>(() => undefined);
		const pending = assert.rejects(service.relayRemoteStreamsWithWatchdog({ stream: sourceStream, close: neverCloses }, { stream: targetStream, close: neverCloses }, () => undefined, 'relay-task'), /canceled/i);
		const canceled = service.cancelTransfer('relay-task');
		await clock.tickAsync(3000);
		await Promise.all([pending, canceled]);
		assert.deepStrictEqual({ sourceDestroyed: sourceStream.destroyed, targetDestroyed: targetStream.destroyed, handlers: service.transferCancelHandlers.size, timers: clock.countTimers() }, { sourceDestroyed: true, targetDestroyed: true, handlers: 0, timers: 0 });
	});

	test('SSH close settles a reverse forwarding cleanup whose callback never arrives', async () => {
		const service = createServiceHarness();
		const client = new SilentClient();
		let settled = false;
		const cleanup = service.unforwardIn(client, '127.0.0.1', 1234).then(() => settled = true, () => settled = true);
		client.emit('close');
		await clock.tickAsync(0);
		assert.deepStrictEqual({ settled, timers: clock.countTimers() }, { settled: true, timers: 0 });
		await cleanup;
	});

	test('silent reverse forwarding cleanup is bounded when close and callback are both lost', async () => {
		const service = createServiceHarness();
		const client = new SilentClient();
		let settled = false;
		const cleanup = service.unforwardIn(client, '127.0.0.1', 1234).then(() => settled = true, () => settled = true);
		await clock.tickAsync(30000);
		assert.deepStrictEqual({ settled, timers: clock.countTimers() }, { settled: true, timers: 0 });
		await cleanup;
	});

	test('SSH close releases a pending reverse forwarding setup', async () => {
		const service = createServiceHarness();
		const client = new SilentClient();
		let settled = false;
		const setup = service.forwardIn(client, '127.0.0.1', 0).then(() => settled = true, () => settled = true);
		client.emit('close');
		await clock.tickAsync(0);
		assert.deepStrictEqual({ settled, timers: clock.countTimers() }, { settled: true, timers: 0 });
		await setup;
	});

	test('cancel releases a pending reverse forwarding setup even when SSH emits no close', async () => {
		const service = createServiceHarness();
		const client = new SilentClient();
		const setup = assert.rejects(service.forwardIn(client, '127.0.0.1', 0, 'forward-task'), /canceled/i);
		await service.cancelTransfer('forward-task');
		await setup;
		assert.deepStrictEqual({ listeners: client.listenerCount('close') + client.listenerCount('error'), handlers: service.transferCancelHandlers.size, timers: clock.countTimers() }, { listeners: 0, handlers: 0, timers: 0 });
	});

	test('late SFTP progress after cancellation rejects the transfer without throwing out of ssh2', async () => {
		const service = createServiceHarness();
		const sftp = new SilentSftp();
		const transfer = assert.rejects(service.fastPut(sftp, '/local', '/remote', service.createSftpTransferOptions(() => undefined, 'step-task')), /canceled/i);
		await service.cancelTransfer('step-task');
		try {
			assert.doesNotThrow(() => sftp.transferOptions?.step?.(1024, 1024, 2048));
			await transfer;
		} finally {
			// If this regression is present, release the pending request before disposing fake timers.
			service.getSftpOperationWatchdog(sftp, new SilentClient()).fail(new Error('Transfer canceled.'));
			await transfer;
		}
	});

	test('cancel settles a local command even when the killed process never emits close', async () => {
		const child = new CommandProcess();
		const service = createServiceHarness(Promise.resolve([]), () => child);
		let settled = false;
		const command = service.runCancelableLocalCommand('fixture', [], {}, 'process-task').then(() => settled = true, () => settled = true);
		await service.cancelTransfer('process-task');
		await clock.tickAsync(0);
		try {
			assert.deepStrictEqual({ settled, handlers: service.transferCancelHandlers.size, timers: clock.countTimers() }, { settled: true, handlers: 0, timers: 0 });
		} finally {
			child.emit('close', 1);
			await command;
		}
	});

	test('a native preparation timeout cannot launch processes when its detector eventually returns', async () => {
		let resolveCharset!: (args: string[]) => void;
		const charsetProbe = new Promise<string[]>(resolve => resolveCharset = resolve);
		let spawned = 0;
		const service = createServiceHarness(charsetProbe, () => {
			spawned++;
			throw new Error('Timed-out preparation started a process.');
		});
		const transfer = assert.rejects(service.runNativeLocalTarUpload([], { host: 'fixture', port: 22, username: 'fixture' }, 'fixture', 'timed-task'), /without data progress/);
		await clock.tickAsync(600000);
		await transfer;
		resolveCharset([]);
		await clock.tickAsync(0);
		assert.deepStrictEqual({ spawned, handlers: service.transferCancelHandlers.size, timers: clock.countTimers() }, { spawned: 0, handlers: 0, timers: 0 });
	});

	test('native tar download cancellation releases both a stalled pipeline and lost process close', async () => {
		const ssh = new CommandProcess();
		const tar = new CommandProcess();
		const service = createServiceHarness(Promise.resolve([]), () => tar);
		const download = assert.rejects(service.pipeNativeTarDownload(ssh, [], 'native-download-task'), /canceled/i);
		await clock.tickAsync(0);
		await service.cancelTransfer('native-download-task');
		await download;
		ssh.stdout.destroy();
		tar.stdin.destroy();
		await clock.tickAsync(0);
		assert.deepStrictEqual({ handlers: service.transferCancelHandlers.size, timers: clock.countTimers() }, { handlers: 0, timers: 0 });
	});

	test('ssh2 tar download cancellation releases both a stalled pipeline and lost remote close', async () => {
		const client = new SilentClient();
		const source = new CommandStream();
		const tar = new CommandProcess();
		const service = createServiceHarness(Promise.resolve([]), () => tar, client);
		const download = assert.rejects(service.pipeRemoteTarDownload({}, 'fixture', [], 'remote-download-task'), /canceled/i);
		await clock.tickAsync(0);
		client.execCallback?.(undefined, source);
		await clock.tickAsync(0);
		const canceled = service.cancelTransfer('remote-download-task');
		await clock.tickAsync(3000);
		await Promise.all([canceled, download]);
		source.destroy();
		tar.stdin.destroy();
		await clock.tickAsync(0);
		assert.deepStrictEqual({ handlers: service.transferCancelHandlers.size, timers: clock.countTimers(), destroyed: client.destroyed }, { handlers: 0, timers: 0, destroyed: true });
	});

	test('growing target bytes keep a quiet native command alive beyond its inactivity budget', async () => {
		const child = new CommandProcess();
		const service = createServiceHarness(Promise.resolve([]), () => child);
		let lastActivityAt = Date.now();
		const command = service.runCancelableLocalCommand('fixture', [], { inactivityTimeoutMs: 120000, getActivityTime: () => lastActivityAt }, 'active-native-task');
		for (let step = 0; step < 5; step++) {
			await clock.tickAsync(60000);
			lastActivityAt = Date.now();
		}
		child.emit('close', 0);
		await command;
		assert.deepStrictEqual({ handlers: service.transferCancelHandlers.size, timers: clock.countTimers() }, { handlers: 0, timers: 0 });
	});

	test('a recent cancellation survives task cleanup and expires without per-task timers', async () => {
		const service = createServiceHarness();
		await service.cancelTransfer('late-task');
		service.clearTaskCancellation('late-task');
		assert.strictEqual(service.isTransferCanceled('late-task'), true);
		await clock.tickAsync(300000);
		assert.deepStrictEqual({ canceled: service.isTransferCanceled('late-task'), tombstones: service.recentlyCanceledTransfers.size, timers: clock.countTimers() }, { canceled: false, tombstones: 0, timers: 0 });
	});

	test('a silent input command times out and destroys its channel without a close callback', async () => {
		const service = createServiceHarness();
		const client = new SilentClient();
		const stream = new ScpStream();
		const failed = assert.rejects(service.execRemoteWithInput(client, 'fixture', Buffer.from('paths'), { inactivityTimeoutMs: 10000 }), /produced no output/);
		client.execCallback?.(undefined, stream);
		await clock.tickAsync(10000);
		await failed;
		assert.deepStrictEqual({ destroyed: stream.destroyed, timers: clock.countTimers(), listeners: client.listenerCount('close') + client.listenerCount('error') },
			{ destroyed: true, timers: 0, listeners: 0 });
	});

	for (const activity of ['heartbeat', 'target-growth'] as const) {
		test(`${activity} keeps a healthy native batch command alive without extra size probes`, async () => {
			const service = createServiceHarness();
			const client = new SilentClient();
			const stream = new ScpStream();
			let lastActivityAt = Date.now();
			const command = service.execRemoteWithInput(client, 'fixture', Buffer.from('paths'), {
				inactivityTimeoutMs: 10000,
				getActivityTime: () => lastActivityAt
			});
			client.execCallback?.(undefined, stream);
			for (let step = 0; step < 5; step++) {
				await clock.tickAsync(5000);
				if (activity === 'heartbeat') {
					stream.stderr.emit('data', Buffer.from('.'));
				} else {
					lastActivityAt = Date.now();
				}
			}
			stream.emit('close', 0);
			await command;
			assert.deepStrictEqual({ destroyed: stream.destroyed, timers: clock.countTimers() }, { destroyed: false, timers: 0 });
			stream.destroy();
		});
	}

	test('cancel releases an input command and closes a channel granted after task cleanup', async () => {
		const service = createServiceHarness();
		const client = new SilentClient();
		const failed = assert.rejects(service.execRemoteWithInput(client, 'fixture', Buffer.from('paths'), { progressId: 'batch-input' }), /canceled/i);
		const canceled = service.cancelTransfer('batch-input');
		await clock.tickAsync(3000);
		await Promise.all([canceled, failed]);
		service.clearTaskCancellation('batch-input');
		const stream = new ScpStream();
		client.execCallback?.(undefined, stream);
		assert.deepStrictEqual({ destroyed: stream.destroyed, timers: clock.countTimers(), handlers: service.transferCancelHandlers.size }, { destroyed: true, timers: 0, handlers: 0 });
	});

	test('SSH connection close rejects an input command immediately', async () => {
		const service = createServiceHarness();
		const client = new SilentClient();
		const failed = assert.rejects(service.execRemoteWithInput(client, 'fixture', Buffer.from('paths')), /connection closed/i);
		client.emit('close');
		await failed;
		assert.strictEqual(clock.countTimers(), 0);
	});

	test('input command forwards live move samples and ignores output after completion', async () => {
		const service = createServiceHarness();
		const client = new SilentClient();
		const stream = new ScpStream();
		const chunks: string[] = [];
		const command = service.execRemoteWithInput(client, 'fixture', Buffer.from('paths'), { onStderr: chunk => chunks.push(chunk) });
		client.execCallback?.(undefined, stream);
		stream.stderr.emit('data', Buffer.from('TURBOFILE_MOVE_DELTA=4096\n'));
		stream.emit('close', 0);
		await command;
		stream.stderr.emit('data', Buffer.from('TURBOFILE_MOVE_DELTA=9999\n'));
		assert.deepStrictEqual(chunks, ['TURBOFILE_MOVE_DELTA=4096\n']);
		stream.destroy();
	});

	test('an owned command watchdog waits for process confirmation before closing its channel', async () => {
		const service = createServiceHarness();
		const client = new SilentClient();
		const stream = new ScpStream();
		let release!: () => void;
		const confirmation = new Promise<void>(resolve => release = resolve);
		const failure = assert.rejects(service.execRemoteWithInput(client, 'fixture', Buffer.from('paths'), {
			inactivityTimeoutMs: 1000, beforeAbort: () => confirmation
		}), /produced no output/);
		client.execCallback?.(undefined, stream);
		await clock.tickAsync(1000);
		assert.strictEqual(stream.destroyed, false);
		release();
		await failure;
		assert.strictEqual(stream.destroyed, true);
	});

	test('exec rejection is distinguished from an unanswered exec request', async () => {
		for (const message of ['Unable to exec', 'No free channels available', '(SSH) Channel open failure: administratively prohibited', 'No response from server']) {
			const service = createServiceHarness();
			const client = new SilentClient();
			const stream = new ScpStream();
			let confirmedNotRunning = false;
			const failure = assert.rejects(service.execRemoteWithInput(client, 'fixture', Buffer.from('paths'), { onExit: () => confirmedNotRunning = true }));
			client.execCallback?.(new Error(message), stream);
			await failure;
			assert.strictEqual(confirmedNotRunning, message !== 'No response from server', message);
			stream.destroy();
		}
	});

	test('a channel close without exit status cannot confirm the remote process stopped', async () => {
		const service = createServiceHarness();
		const client = new SilentClient();
		const stream = new ScpStream();
		let confirmedNotRunning = false;
		const failure = assert.rejects(service.execRemoteWithInput(client, 'fixture', Buffer.from('paths'), { onExit: () => confirmedNotRunning = true }));
		client.execCallback?.(undefined, stream);
		stream.emit('close', undefined, undefined);
		await failure;
		assert.strictEqual(confirmedNotRunning, false);
		stream.destroy();
	});

	for (const direction of ['upload', 'download'] as const) {
		test(`cancel releases the actual SCP ${direction} header handshake when stream close is lost`, async () => {
			const fixtureParent = path.join(process.cwd(), '.build');
			const fixture = await fs.promises.mkdtemp(path.join(fixtureParent, 'turbofile-scp-cancel-'));
			const localPath = path.join(fixture, 'file.bin');
			try {
				await fs.promises.writeFile(localPath, 'fixture');
				const service = createServiceHarness();
				const client = new SilentClient();
				const stream = new ScpStream();
				const channelRequested = new Promise<void>(resolve => client.once('execRequested', resolve));
				const pending = direction === 'upload'
					? service.uploadFileWithScpProtocolOnClient(client, 'fixture', localPath, '/fixture', 7, undefined, 'scp-task')
					: service.downloadFileWithScpProtocolOnClient(client, 'fixture', localPath, 7, undefined, 'scp-task');
				const failed = pending.then(() => undefined, (error: Error) => error);
				await Promise.race([channelRequested, failed.then(error => { throw error ?? new Error('SCP completed before its channel was requested.'); })]);
				client.execCallback?.(undefined, stream);
				await clock.tickAsync(0);
				const canceled = service.cancelTransfer('scp-task');
				await clock.tickAsync(3000);
				const [, failure] = await Promise.all([canceled, failed]);
				assert.deepStrictEqual({ errorName: failure?.name, handlers: service.transferCancelHandlers.size, timers: clock.countTimers(), destroyed: stream.destroyed }, { errorName: 'TurboFileTransferCanceledError', handlers: 0, timers: 0, destroyed: true });
			} finally {
				assert.strictEqual(path.dirname(fixture), fixtureParent);
				await fs.promises.rm(fixture, { recursive: true, force: true });
			}
		});
	}

	for (const variant of ['single', 'parallel', 'compressed'] as const) {
		test(`cancel during native ${variant} tar preparation never starts processes afterwards`, async () => {
			let resolveCharset!: (args: string[]) => void;
			const charsetProbe = new Promise<string[]>(resolve => resolveCharset = resolve);
			let spawned = 0;
			const service = createServiceHarness(charsetProbe, () => {
				spawned++;
				throw new Error('Process started after the task was canceled.');
			});
			const connection: ITurboFileSshConnectionOptions = { host: 'fixture', port: 22, username: 'fixture' };
			const tool = { executable: 'fixture', env: {} };
			const transfer = variant === 'single'
				? service.runNativeLocalTarUpload([], connection, 'fixture', 'native-task')
				: variant === 'parallel'
					? service.runNativeLocalTarUploadChunk('/fixture', { listPath: '/fixture.lst' }, connection, tool, 'fixture', 'native-task')
					: service.runNativeLocalTarZstdUploadChunk('/fixture', { listPath: '/fixture.lst' }, connection, tool, tool, 'fixture', 'native-task');
			let failure: Error | undefined;
			let transferSettled = false;
			const completed = transfer.then(() => transferSettled = true, error => {
				transferSettled = true;
				failure = error;
			});
			await clock.tickAsync(0);
			await service.cancelTransfer('native-task');
			await clock.tickAsync(0);
			assert.strictEqual(transferSettled, true, 'Cancellation must finish while charset detection is still pending.');
			resolveCharset([]);
			await completed;
			await clock.tickAsync(0);
			assert.deepStrictEqual({ spawned, errorName: failure?.name, handlers: service.transferCancelHandlers.size }, { spawned: 0, errorName: 'TurboFileTransferCanceledError', handlers: 0 });
		});
	}
});
