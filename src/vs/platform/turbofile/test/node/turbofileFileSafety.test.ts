/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { createRequire } from 'module';
import * as ts from 'typescript';
import { localize } from '../../../../nls.js';
import { captureTurboFileLocalMoveSnapshots } from '../../node/turbofileMoveSafety.js';
import { withTurboFileTimeout } from '../../common/turbofileTimeout.js';

interface IReceipt {
	readonly sourceKind: 'local' | 'ssh';
	readonly files: { path: string; size: number; mtime: number; ctime?: number; ino?: number }[];
	readonly directories: Set<string>;
}

interface IHarness {
	readonly remote: Map<string, Buffer>;
	readonly modes: Map<string, number>;
	readonly links: Set<string>;
	readonly sftpMoveReceipts: Map<string, IReceipt>;
	readonly batchMoveSnapshots: Map<string, ReadonlyMap<string, IReceipt>>;
	readonly sftpConnectionConfigs: WeakMap<object, object>;
	readonly calls: string[];
	rawFailure?: Error;
	commitFailure: boolean;
	restoreFailure: boolean;
	backupAckLost: boolean;
	commitAckLost: boolean;
	canceled: boolean;
	onCopied?: () => Promise<void>;
	planSizes: number[];
	peakFileTasks: number;
	fastPut(sftp: object, localPath: string, remotePath: string, options?: object, progressId?: string): Promise<void>;
	fastGet(sftp: object, remotePath: string, localPath: string, options?: object, progressId?: string): Promise<void>;
	replaceRemoteFile(sftp: object, temporary: string, target: string, progressId?: string): Promise<void>;
	deleteSftpMoveSources(source: { kind: string }, receipt: IReceipt, progressId?: string): Promise<void>;
	deleteBatchSources(source: { kind: string }, items: { sourcePath: string; targetName: string }[], progressId?: string, receipts?: ReadonlyMap<string, IReceipt>): Promise<unknown[]>;
	moveLocalPathNative(source: string, target: string): Promise<void>;
	relayRemoteFileInParallel(source: object, target: object, sourcePath: string, targetPath: string, bytes: number, onDelta?: (delta: number) => void): Promise<void>;
	runSftpWorkers<T>(pool: { primary: object; additional: Promise<object>[] }, items: readonly T[], progressId: string | undefined, worker: (sftp: object, item: T, index: number) => Promise<void>, slots?: number): Promise<void>;
	uploadDirectoryConcurrent(endpoint: object, local: string, remote: string): Promise<void>;
}

/** Fault injection runs the real safety/commit methods, with only the transport and filesystem boundaries replaced. */
function createHarness(localFs: typeof fs.promises = fs.promises, useRealRaw = false): IHarness {
	const filename = path.join(process.cwd(), 'src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts');
	const source = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true);
	const names = new Set(['fastPut', 'fastGet', 'replaceRemoteFile', 'getRemoteFileForReplacement', 'deleteSftpMoveSources', 'deleteBatchSources', 'moveLocalPathNative', 'relayRemoteFileInParallel', 'cleanupRemoteOwnedTemporary', 'runSftpWorkers', 'uploadDirectoryConcurrent']);
	if (useRealRaw) { names.add('fastPutRaw'); }
	const methods: string[] = [];
	const visit = (node: ts.Node): void => {
		if (ts.isMethodDeclaration(node) && names.has(node.name.getText(source))) { methods.push(node.getText(source)); }
		ts.forEachChild(node, visit);
	};
	visit(source);
	assert.strictEqual(methods.length, names.size);
	const code = ts.transpileModule(`class Harness {
		remote = new Map(); modes = new Map(); links = new Set(); sftpMoveReceipts = new Map(); batchMoveSnapshots = new Map(); sftpConnectionConfigs = new WeakMap(); calls = []; commitFailure = false; restoreFailure = false; canceled = false; backupAckLost = false; commitAckLost = false;
		throwIfTransferCanceled() { if (this.canceled) { throw new Error('Transfer canceled.'); } }
		getSftpOperationWatchdog() { return { run: fn => fn(() => {}) }; }
		async remoteStat(sftp, file) {
			if (!this.remote.has(file)) { throw Object.assign(new Error('No such file'), { code: 2 }); }
			return { size: this.remote.get(file).length, mtime: 1, mode: this.modes.get(file) ?? 0o644, isFile: () => !this.links.has(file), isSymbolicLink: () => this.links.has(file) };
		}
		async remoteLstat(sftp, file) { return this.remoteStat(sftp, file); }
		async chmodRemote(sftp, file, mode) { this.modes.set(file, mode); }
		async openRemoteFile(sftp, file, flags, mode) {
			if (flags === 'r') { if (!this.remote.has(file)) { throw new Error('Source missing'); } return Buffer.from(file); }
			if (this.remote.has(file)) { throw new Error('Already exists'); }
			this.remote.set(file, Buffer.alloc(0)); this.modes.set(file, (mode ?? 0o666) & ~0o022); return Buffer.from(file);
		}
		async closeRemoteFile() {}
		async readRemoteFileChunkExact(sftp, handle, buffer, length, position) { this.remote.get(handle.toString()).copy(buffer, 0, position, position + length); }
		async writeRemoteFileChunk(sftp, handle, buffer, length, position) {
			if (this.rawFailure) { throw this.rawFailure; }
			const old = this.remote.get(handle.toString()); const output = Buffer.alloc(Math.max(old.length, position + length)); old.copy(output); buffer.copy(output, position, 0, length); this.remote.set(handle.toString(), output);
		}
		async fastPutRaw(sftp, local, remote, options, exclusive) {
			await this.openRemoteFile(sftp, remote, 'wx', exclusive.mode); exclusive.onCreated();
			this.remote.set(remote, this.rawFailure ? Buffer.from('partial') : await fsp.readFile(local));
			options?.step?.(this.remote.get(remote).length, this.remote.get(remote).length, this.remote.get(remote).length);
			await this.onCopied?.(); if (this.rawFailure) { throw this.rawFailure; }
		}
		async fastGetRaw(sftp, remote, local) {
			await fsp.writeFile(local, this.rawFailure ? 'partial' : this.remote.get(remote));
			await this.onCopied?.(); if (this.rawFailure) { throw this.rawFailure; }
		}
		async renameRemote(sftp, from, to) {
			this.calls.push('rename:' + from + ':' + to);
			if (this.commitFailure && from.endsWith('.part')) { throw new Error('Injected commit failure'); }
			if (this.restoreFailure && from.endsWith('.backup')) { throw new Error('Injected restore failure'); }
			if (this.remote.has(to)) { throw new Error('File exists'); }
			if (!this.remote.has(from)) { throw new Error('Source missing'); }
			this.remote.set(to, this.remote.get(from)); this.remote.delete(from);
			this.modes.set(to, this.modes.get(from)); this.modes.delete(from);
			if (this.backupAckLost && to.endsWith('.backup')) { throw new Error('Backup acknowledgement lost'); }
			if (this.commitAckLost && from.endsWith('.part')) { throw new Error('Commit acknowledgement lost'); }
		}
		async unlinkRemoteBestEffort(sftp, file) { if (sftp.disconnected) { return false; } this.remote.delete(file); return true; }
		async connect(config, progressId, onCreated) { if (progressId !== undefined) { throw new Error('Cleanup must not inherit canceled task'); } this.calls.push('cleanup-connect'); const client = { end: () => {}, destroy: () => { this.calls.push('cleanup-closed'); } }; onCreated(client); return client; }
		async openSftp() { return {}; }
		async copyLocalPath(source, target) { this.calls.push('copy'); await fsp.cp(source, target, { recursive: true }); }
		planSizes = []; peakFileTasks = 0; activeFileTasks = 0;
		async collectLocalDirectoryTransferPlan() { return { files: this.planSizes.map((size, index) => ({ size, localPath: 'local'+index, remotePath: 'remote'+index })), directories: [], totalBytes: this.planSizes.reduce((sum, size) => sum + size, 0) }; }
		getDirectorySftpConnectionCount() { return 1; }
		async withSftpPool(_endpoint, count, _progressId, callback) { this.calls.push('pool:' + count); return callback({ primary: {}, additional: [] }); }
		async ensureRemoteDirectoriesForUpload() {}
		async fastPutWithFallback() { this.activeFileTasks++; this.peakFileTasks = Math.max(this.peakFileTasks, this.activeFileTasks); await new Promise(resolve => setImmediate(resolve)); this.activeFileTasks--; }
		${methods.join('\n')}
	}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
	const Harness: new () => IHarness = new Function('fsp', 'randomUUID', 'join', 'dirname', 'joinRemotePath', 'getRemoteParentPath', 'localize', 'formatTransferError', 'SFTP_REQUEST_TIMEOUT_MS', 'platform', 'looksLikeWindowsPath', 'ensureLocalParentDirectory', 'isCrossDeviceMoveError', 'isRemotePathMissingError', 'SFTP_RELAY_CHUNK_SIZE', 'SFTP_RELAY_CONCURRENCY', 'mapLimit', 'captureTurboFileLocalMoveSnapshots', 'withTurboFileTimeout', 'REMOTE_FILE_TRANSFER_INACTIVITY_TIMEOUT_MS', `${code}; return Harness;`)(
		localFs, randomUUID, path.join, path.dirname, path.posix.join, path.posix.dirname, localize, (error: Error) => error.message, 30000,
		() => 'win32', () => true, async () => { }, (error: NodeJS.ErrnoException) => error.code === 'EXDEV', (error: { code: number }) => error.code === 2,
		4, 2, async (items: readonly number[], _limit: number, work: (item: number) => Promise<void>) => Promise.all(items.map(work)), captureTurboFileLocalMoveSnapshots, withTurboFileTimeout, 120000
	);
	return new Harness();
}

suite('TurboFileFileSafety', () => {
	let root: string;
	let service: IHarness;
	setup(async () => {
		const parent = path.join(process.cwd(), '.build', 'file-safety-tests');
		await fs.promises.mkdir(parent, { recursive: true });
		root = await fs.promises.mkdtemp(path.join(parent, 'case-'));
		service = createHarness();
	});
	teardown(async () => {
		await fs.promises.rm(root, { recursive: true, force: true });
	});

	test('failed and canceled uploads preserve the old target and remove only their own temporary file', async () => {
		const local = path.join(root, 'source');
		await fs.promises.writeFile(local, 'new content');
		for (const canceled of [false, true]) {
			service.remote.set('/target', Buffer.from('old content'));
			service.remote.set('/unrelated.part', Buffer.from('someone else'));
			service.rawFailure = canceled ? undefined : new Error('Connection lost');
			service.canceled = canceled;
			await assert.rejects(service.fastPut({}, local, '/target'));
			assert.deepStrictEqual([...service.remote].map(([name, value]) => [name, value.toString()]), [['/target', 'old content'], ['/unrelated.part', 'someone else']]);
		}
	});

	test('failed download keeps the existing local file and clears its partial temporary', async () => {
		const target = path.join(root, 'target');
		await fs.promises.writeFile(target, 'old content');
		service.remote.set('/source', Buffer.from('new content'));
		service.rawFailure = new Error('Connection lost');
		await assert.rejects(service.fastGet({}, '/source', target), /Connection lost/);
		assert.deepStrictEqual({ content: await fs.promises.readFile(target, 'utf8'), files: await fs.promises.readdir(root) }, { content: 'old content', files: ['target'] });
	});

	test('parallel SFTP relay keeps the old target on write failure and commits a successful retry', async () => {
		service.remote.set('/source', Buffer.from('12345678'));
		service.remote.set('/target', Buffer.from('old'));
		service.rawFailure = new Error('Disk full');
		await assert.rejects(service.relayRemoteFileInParallel({}, {}, '/source', '/target', 8), /Disk full/);
		assert.deepStrictEqual([...service.remote].map(([name, value]) => [name, value.toString()]), [['/source', '12345678'], ['/target', 'old']]);
		service.rawFailure = undefined;
		await service.relayRemoteFileInParallel({}, {}, '/source', '/target', 8);
		assert.deepStrictEqual([...service.remote].map(([name, value]) => [name, value.toString()]), [['/source', '12345678'], ['/target', '12345678']]);
	});

	test('NAS compatibility rename restores the old file if commit fails', async () => {
		service.remote.set('/target', Buffer.from('old'));
		service.remote.set('/task.part', Buffer.from('new'));
		service.commitFailure = true;
		await assert.rejects(service.replaceRemoteFile({}, '/task.part', '/target'), /commit failure/);
		assert.deepStrictEqual([...service.remote].sort().map(([name, value]) => [name, value.toString()]), [['/target', 'old'], ['/task.part', 'new']]);
	});

	test('NAS restore failure keeps the backup and includes its recoverable path', async () => {
		service.remote.set('/target', Buffer.from('old'));
		service.remote.set('/task.part', Buffer.from('new'));
		service.commitFailure = service.restoreFailure = true;
		await assert.rejects(service.replaceRemoteFile({}, '/task.part', '/target'), /recovery path \/.turbofile-.*\.backup/);
		const backups = [...service.remote].filter(([name]) => name.endsWith('.backup'));
		assert.deepStrictEqual(backups.map(([, value]) => value.toString()), ['old']);
	});

	test('a lost backup rename acknowledgement restores the old target without deleting it', async () => {
		service.remote.set('/target', Buffer.from('old'));
		service.remote.set('/task.part', Buffer.from('new'));
		service.backupAckLost = true;
		await assert.rejects(service.replaceRemoteFile({}, '/task.part', '/target'), /Backup acknowledgement lost/);
		assert.deepStrictEqual([...service.remote].sort().map(([name, value]) => [name, value.toString()]), [['/target', 'old'], ['/task.part', 'new']]);
	});

	test('a lost final rename acknowledgement preserves both versions and reports the recovery path', async () => {
		service.remote.set('/target', Buffer.from('old'));
		service.remote.set('/task.part', Buffer.from('new'));
		service.commitAckLost = true;
		await assert.rejects(service.replaceRemoteFile({}, '/task.part', '/target'), /recovery path/);
		assert.deepStrictEqual({ current: service.remote.get('/target')!.toString(), backups: [...service.remote].filter(([name]) => name.endsWith('.backup')).map(([, value]) => value.toString()) }, { current: 'new', backups: ['old'] });
	});

	test('unsupported OpenSSH extension falls back to a reversible NAS overwrite', async () => {
		service.remote.set('/target', Buffer.from('old'));
		service.remote.set('/task.part', Buffer.from('new'));
		await service.replaceRemoteFile({ ext_openssh_rename() { throw new Error('Server does not support this extended request'); } }, '/task.part', '/target');
		assert.deepStrictEqual([...service.remote].map(([name, value]) => [name, value.toString()]), [['/target', 'new']]);
	});

	test('atomic upload preserves executable and private destination permissions', async () => {
		const local = path.join(root, 'source');
		await fs.promises.writeFile(local, 'new');
		for (const mode of [0o755, 0o600]) {
			service.remote.set('/target', Buffer.from('old'));
			service.modes.set('/target', mode);
			await service.fastPut({}, local, '/target');
			assert.deepStrictEqual({ content: service.remote.get('/target')!.toString(), mode: service.modes.get('/target') }, { content: 'new', mode });
		}
	});

	test('atomic upload refuses a symbolic-link target without replacing it', async () => {
		const local = path.join(root, 'source');
		await fs.promises.writeFile(local, 'new');
		service.remote.set('/target', Buffer.from('old'));
		service.links.add('/target');
		await assert.rejects(service.fastPut({}, local, '/target'), /symbolic link/);
		assert.deepStrictEqual([...service.remote].map(([name, value]) => [name, value.toString()]), [['/target', 'old']]);
	});

	test('new remote files retain the server default creation mode and umask', async () => {
		const local = path.join(root, 'source');
		await fs.promises.writeFile(local, 'new');
		await service.fastPut({}, local, '/new');
		assert.strictEqual(service.modes.get('/new'), 0o644);
	});

	test('real ssh2 fastPut exclusively opens each stage once and retains shared-channel state across concurrent uploads', async () => {
		service = createHarness(fs.promises, true);
		const native = createRequire(import.meta.url)('ssh2/lib/protocol/SFTP.js') as { SFTP: { prototype: { fastPut: Function } } };
		const payload = Buffer.alloc(64 * 1024, 0x55);
		const source = path.join(root, 'source');
		const empty = path.join(root, 'empty');
		await fs.promises.writeFile(source, payload);
		await fs.promises.writeFile(empty, '');
		const opens: string[] = [], closes: string[] = [];
		let closeFailure = false;
		const transport = {
			server: false, outgoing: { state: 'open' }, fastPut: native.SFTP.prototype.fastPut,
			open(file: string, flags: string, attrs: { mode: number }, callback: (error: Error | undefined, handle?: Buffer) => void) {
				assert.strictEqual(this, transport, 'native channel request state must not be copied onto an adapter');
				assert.strictEqual(flags, 'wx');
				assert.ok(!service.remote.has(file));
				opens.push(file); service.remote.set(file, Buffer.alloc(0)); service.modes.set(file, attrs.mode & ~0o022);
				setImmediate(() => callback(undefined, Buffer.from(file)));
			},
			write(handle: Buffer, buffer: Buffer, offset: number, length: number, position: number, callback: (error?: Error) => void) {
				assert.strictEqual(this, transport);
				const name = handle.toString(), previous = service.remote.get(name)!;
				const next = Buffer.alloc(Math.max(previous.length, position + length));
				previous.copy(next); buffer.copy(next, position, offset, offset + length); service.remote.set(name, next);
				setImmediate(callback);
			},
			close(handle: Buffer, callback: (error?: Error) => void) { assert.strictEqual(this, transport); closes.push(handle.toString()); setImmediate(() => callback(closeFailure ? new Error('Injected CLOSE failure') : undefined)); }
		};
		await Promise.all([
			service.fastPut(transport, source, '/one', { concurrency: 2, chunkSize: 4096 }),
			service.fastPut(transport, source, '/two', { concurrency: 2, chunkSize: 4096 }),
			service.fastPut(transport, empty, '/empty', { concurrency: 2, chunkSize: 4096 })
		]);
		assert.strictEqual(opens.length, 3, 'no extra reservation/re-open');
		assert.deepStrictEqual(closes.sort(), opens.sort());
		assert.deepStrictEqual(service.remote.get('/one'), payload);
		assert.deepStrictEqual(service.remote.get('/two'), payload);
		assert.strictEqual(service.remote.get('/empty')!.length, 0);
		assert.strictEqual([...service.remote.keys()].some(name => name.endsWith('.part')), false);
		closeFailure = true;
		service.remote.set('/empty-failed', Buffer.from('original'));
		await assert.rejects(service.fastPut(transport, empty, '/empty-failed', { concurrency: 2, chunkSize: 4096 }), /Injected CLOSE failure/);
		assert.strictEqual(service.remote.get('/empty-failed')!.toString(), 'original');
		assert.strictEqual([...service.remote.keys()].some(name => name.endsWith('.part')), false);
	});

	test('canceling a disconnected upload retries only its owned partial file on a fresh bounded connection', async () => {
		const local = path.join(root, 'source');
		await fs.promises.writeFile(local, 'new');
		const sftp = { disconnected: false };
		service.sftpConnectionConfigs.set(sftp, { host: 'test' });
		service.remote.set('/target', Buffer.from('old'));
		service.remote.set('/someone-else.part', Buffer.from('other task'));
		service.onCopied = async () => { service.canceled = true; sftp.disconnected = true; };
		await assert.rejects(service.fastPut(sftp, local, '/target', undefined, 'canceled'), /Transfer canceled/);
		assert.deepStrictEqual([...service.remote].map(([name, value]) => [name, value.toString()]), [['/target', 'old'], ['/someone-else.part', 'other task']]);
		assert.deepStrictEqual(service.calls, ['cleanup-connect', 'cleanup-closed']);
	});

	test('batch move keeps the original high precision snapshot instead of a weaker SFTP receipt', async () => {
		const original: IReceipt = { sourceKind: 'ssh', files: [{ path: '/source/file', size: 3, mtime: 1 }], directories: new Set(['/source']) };
		const receipt: IReceipt = { sourceKind: 'ssh', files: [], directories: new Set() };
		service.batchMoveSnapshots.set('move', new Map([['/source', original]]));
		let used: IReceipt | undefined;
		service.deleteSftpMoveSources = async (_source, snapshot) => { used = snapshot; };
		const failures = await service.deleteBatchSources({ kind: 'ssh' }, [{ sourcePath: '/source', targetName: 'target' }], 'move', new Map([['/source', receipt]]));
		assert.deepStrictEqual(failures, []);
		assert.strictEqual(used, original);
	});

	test('coarse remote timestamps never authorize deleting a possibly changed source file', async () => {
		service.remote.set('/source', Buffer.from('new'));
		const receipt: IReceipt = { sourceKind: 'ssh', files: [{ path: '/source', size: 3, mtime: 1 }], directories: new Set() };
		await assert.rejects(service.deleteSftpMoveSources({ kind: 'ssh' }, receipt), /source was kept.*coarse file timestamps/);
		assert.strictEqual(service.remote.get('/source')!.toString(), 'new');
		assert.deepStrictEqual(service.calls, []);
	});

	test('directory worker failure waits for other owned temporary cleanup before returning', async () => {
		let fail!: () => void;
		let clean!: () => void;
		let secondStarted!: () => void;
		const started = new Promise<void>(resolve => { secondStarted = resolve; });
		const failed = new Promise<void>(resolve => { fail = resolve; });
		const cleaned = new Promise<void>(resolve => { clean = resolve; });
		let finished = false;
		const transfer = service.runSftpWorkers({ primary: {}, additional: [Promise.resolve({})] }, [0, 1, 2], undefined, async (_sftp, item) => {
			if (item === 0) { await failed; throw new Error('Injected worker failure'); }
			assert.strictEqual(item, 1, 'no new work should start after failure');
			secondStarted();
			await cleaned;
		});
		const rejected = assert.rejects(transfer, /Injected worker failure/).then(() => { finished = true; });
		await started;
		fail();
		await new Promise<void>(resolve => setImmediate(resolve));
		assert.strictEqual(finished, false, 'batch must wait for in-flight cleanup');
		clean();
		await rejected;
	});

	test('tiny directory uploads pipeline three files on the same channel while mixed directories keep one', async () => {
		for (const largeFile of [false, true]) {
			service = createHarness();
			service.planSizes = [32, 64, largeFile ? 65537 : 65536, 16, 128, 32];
			await service.uploadDirectoryConcurrent({}, '/local', '/remote');
			assert.strictEqual(service.peakFileTasks, largeFile ? 1 : 3);
			assert.deepStrictEqual(service.calls, ['pool:1'], 'pipelining must not request additional SSH connections');
		}
	});

	test('three tasks on one channel stop scheduling on failure or cancel and wait for every cleanup', async () => {
		for (const cancel of [false, true]) {
			service = createHarness();
			const releases: (() => void)[] = [];
			const started: number[] = [];
			let finished = false;
			const transfer = service.runSftpWorkers({ primary: {}, additional: [] }, [0, 1, 2, 3, 4], 'pipeline', async (_sftp, item) => {
				started.push(item);
				await new Promise<void>(resolve => { releases[item] = resolve; });
				if (item === 0) { if (cancel) { service.canceled = true; } throw new Error(cancel ? 'canceled' : 'failed'); }
			}, 3);
			const rejected = assert.rejects(transfer, cancel ? /canceled/ : /failed/).then(() => { finished = true; });
			assert.deepStrictEqual(started, [0, 1, 2]);
			releases[0]();
			await new Promise<void>(resolve => setImmediate(resolve));
			assert.strictEqual(finished, false);
			releases[1]();
			await new Promise<void>(resolve => setImmediate(resolve));
			assert.strictEqual(finished, false);
			releases[2]();
			await rejected;
			assert.deepStrictEqual(started, [0, 1, 2]);
		}
	});

	test('move cleanup preserves newly created and modified files while removing confirmed unchanged files', async () => {
		const unchanged = path.join(root, 'unchanged');
		const changed = path.join(root, 'changed');
		await fs.promises.writeFile(unchanged, 'copied');
		await fs.promises.writeFile(changed, 'copied');
		const receipt: IReceipt = { sourceKind: 'local', files: [], directories: new Set([root]) };
		for (const file of [unchanged, changed]) {
			const stat = await fs.promises.stat(file);
			receipt.files.push({ path: file, size: stat.size, mtime: stat.mtimeMs, ctime: stat.ctimeMs, ino: stat.ino });
		}
		await fs.promises.writeFile(changed, 'changed after copy');
		await fs.promises.writeFile(path.join(root, 'new'), 'not copied');
		await assert.rejects(service.deleteSftpMoveSources({ kind: 'local' }, receipt), /partially completed/);
		assert.deepStrictEqual((await fs.promises.readdir(root)).sort(), ['changed', 'new']);
	});

	test('source mutation during a move upload does not replace the target or create a cleanup receipt', async () => {
		const source = path.join(root, 'source');
		await fs.promises.writeFile(source, 'copied');
		const receipt: IReceipt = { sourceKind: 'local', files: [], directories: new Set() };
		service.sftpMoveReceipts.set('move', receipt);
		service.remote.set('/target', Buffer.from('old'));
		service.onCopied = async () => { await fs.promises.writeFile(source, 'changed after read'); };
		await assert.rejects(service.fastPut({}, source, '/target', undefined, 'move'), /source changed/);
		assert.deepStrictEqual({ target: service.remote.get('/target')!.toString(), receipts: receipt.files.length, remoteFiles: service.remote.size }, { target: 'old', receipts: 0, remoteFiles: 1 });
	});

	test('cross-volume move retains the complete destination after partial source deletion fails', async () => {
		const source = path.join(root, 'source');
		const target = path.join(root, 'target');
		await fs.promises.mkdir(source);
		await fs.promises.writeFile(path.join(source, 'a'), 'first');
		await fs.promises.writeFile(path.join(source, 'b'), 'second');
		const removed: string[] = [];
		const localFs = {
			...fs.promises,
			rename: async () => { throw Object.assign(new Error('Cross device'), { code: 'EXDEV' }); },
			unlink: async (file: fs.PathLike) => { removed.push(String(file)); if (removed.length === 2) { throw new Error('Source cleanup failed'); } await fs.promises.unlink(file); }
		} as typeof fs.promises;
		service = createHarness(localFs);
		await assert.rejects(service.moveLocalPathNative(source, target), /copy was completed and kept at/);
		assert.deepStrictEqual({ calls: service.calls, sourceFiles: (await fs.promises.readdir(source)).length, targetFiles: (await fs.promises.readdir(target)).sort() }, { calls: ['copy'], sourceFiles: 1, targetFiles: ['a', 'b'] });
	});
});
