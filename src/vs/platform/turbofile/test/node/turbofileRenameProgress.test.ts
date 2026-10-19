/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import { localize } from '../../../../nls.js';
import { ITurboFileCancelableOperationOptions, ITurboFileFileOperationResult, ITurboFileTransferEndpoint } from '../../common/turbofile.js';
import { buildPosixMoveProgressFunction, TurboFileMoveProgressParser } from '../../common/turbofileMoveProgress.js';
import { TurboFileRemoteCancellationError } from '../../common/turbofileRemoteProcessControl.js';

interface ICall {
	readonly kind: string;
	readonly progressId?: string;
	readonly command?: string;
}

interface IProgress {
	readonly phase: string;
	readonly state?: string;
	readonly strategy: string;
}

interface IHarness {
	readonly calls: ICall[];
	readonly progress: IProgress[];
	readonly bytes: number[];
	readonly transferCancellationRequests: Set<string>;
	ioChunks?: readonly string[];
	deltas?: readonly number[];
	deliverLateStderr?: (chunk: string) => void;
	canceled: boolean;
	failure?: Error;
	pending?: Promise<void>;
	renamePath(endpoint: ITurboFileTransferEndpoint, target: string, options?: ITurboFileCancelableOperationOptions): Promise<ITurboFileFileOperationResult>;
	movePathsIntoDirectory(endpoints: readonly ITurboFileTransferEndpoint[], target: string, options?: ITurboFileCancelableOperationOptions): Promise<ITurboFileFileOperationResult>;
}

/** Runs the existing rename route so overwrite semantics are not replaced by batch mv -n. */
function createHarness(useSftp = false): IHarness {
	const file = path.join(process.cwd(), 'src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts');
	const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
	const names = new Set(['renamePath', 'renamePathCore', 'moveRemotePathNative', 'moveRemotePathWithFallback', 'moveRemotePathWithSftp', 'movePathsIntoDirectory']);
	const helperNames = new Set(['TurboFileTransferCanceledError', 'quotePosixShellArg']);
	const methods: string[] = [];
	const helpers: string[] = [];
	const visit = (node: ts.Node): void => {
		if (ts.isMethodDeclaration(node) && names.has(node.name.getText(source))) {
			methods.push(node.getText(source));
		}
		if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name && helperNames.has(node.name.text)) {
			helpers.push(node.getText(source));
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
	assert.deepStrictEqual({ methods: methods.length, helpers: helpers.length }, { methods: names.size, helpers: helperNames.size });
	const code = ts.transpileModule(`${helpers.join('\n')}
		class Harness {
			calls = []; progress = []; bytes = []; transferCancellationRequests = new Set(); canceled = false;
			throwIfTransferCanceled() { if (this.canceled) { throw new TurboFileTransferCanceledError(); } }
			isTransferCanceled() { return this.canceled; }
			fireTransferProgress(request, bytes, total, phase, detail, force, extra) { this.bytes.push(bytes); this.progress.push({ phase, ...extra }); }
			clearTaskCancellation(progressId) { this.transferCancellationRequests.delete(progressId); }
			scheduleTransferProgressCleanup(progressId) { this.calls.push({ kind: 'cleanup', progressId }); }
			clearRemoteDirectoryListingCache() {}
			async moveLocalPathNative(source, target, progressId, onDelta) { this.calls.push({ kind: 'local', progressId }); for (const delta of this.deltas ?? []) { onDelta?.(delta); } }
			async movePathsIntoDirectoryCore(sources, target, progressId, onDelta) {
				this.calls.push({ kind: 'batch-move', progressId });
				for (const delta of this.deltas ?? []) { onDelta?.(delta); }
				if (this.pending) { await this.pending; }
				return this.failure ? { ok: false, message: this.failure.message } : { ok: true, message: 'Paths moved.' };
			}
			async withSshClient(endpoint, run, progressId) { this.currentProgressId = progressId; this.calls.push({ kind: 'ssh', progressId }); return run({}); }
			async withOwnedRemoteProcess(client, progressId, run) { return run(); }
			async execRemote(client, command, options) {
				this.calls.push({ kind: 'exec', command, progressId: options.progressId });
				this.deliverLateStderr = options.onStderr;
				for (const chunk of this.ioChunks ?? []) { options.onStderr?.(chunk); }
				if (this.pending) { await this.pending; }
				if (this.failure) { throw this.failure; }
			}
			async runRemoteMutationWithSftpFallback(endpoint, capability, progressId, native, portable, sftp) {
				this.calls.push({ kind: 'mutation', progressId }); return useSftp ? sftp() : native();
			}
			async withDirectorySftp(endpoint, run, progressId) { this.calls.push({ kind: 'sftp', progressId }); return run({}); }
			async ensureRemoteDirectory() {}
			async renameRemote() { this.calls.push({ kind: 'sftp-rename' }); }
			${methods.join('\n')}
		}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
	const Harness: new () => IHarness = new Function('useSftp', 'localize', 'getTransferName', 'getRemoteParentPath', 'looksLikeWindowsPath', 'formatTransferError', 'TRANSFER_CANCELED_MESSAGE', 'buildPosixMoveProgressFunction', 'TurboFileMoveProgressParser', 'TurboFileRemoteCancellationError', `${code}; return Harness;`)(
		useSftp, localize, path.posix.basename, path.posix.dirname, () => false, (error: Error) => error.message, 'Transfer canceled.', buildPosixMoveProgressFunction, TurboFileMoveProgressParser, TurboFileRemoteCancellationError
	);
	return new Harness();
}

const remote: ITurboFileTransferEndpoint = { kind: 'ssh', path: '/source/file.txt', connection: { host: 'fixture', username: 'fixture', port: 22 } };

suite('TurboFileRenameProgress', () => {
	test('same-host cut keeps the overwrite-capable native command and forwards cancellation', async () => {
		const service = createHarness();
		const result = await service.renamePath(remote, '/target/file.txt', { progressId: 'cut' });
		assert.deepStrictEqual({ result: result.ok, calls: service.calls, progress: service.progress }, {
			result: true,
			calls: [
				{ kind: 'mutation', progressId: 'cut' }, { kind: 'ssh', progressId: 'cut' },
				{ kind: 'exec', progressId: 'cut', command: `${buildPosixMoveProgressFunction()}; mkdir -p '/target' && tf_run_move mv -f '/source/file.txt' '/target/file.txt'` },
				{ kind: 'cleanup', progressId: 'cut' }
			],
			progress: [{ phase: 'transfer', strategy: 'remote-copy' }, { phase: 'complete', strategy: 'remote-copy', state: 'completed' }]
		});
	});

	test('SFTP compatibility rename receives the same cancellation ID', async () => {
		const service = createHarness(true);
		const result = await service.renamePath(remote, '/target/file.txt', { progressId: 'cut' });
		assert.deepStrictEqual({ ok: result.ok, calls: service.calls }, { ok: true, calls: [
			{ kind: 'mutation', progressId: 'cut' }, { kind: 'sftp', progressId: 'cut' }, { kind: 'sftp-rename' }, { kind: 'cleanup', progressId: 'cut' }
		] });
	});

	test('local metadata move retains its native path without a size scan', async () => {
		const service = createHarness();
		const result = await service.renamePath({ kind: 'local', path: '/source/file.txt' }, '/target/file.txt', { progressId: 'local-cut' });
		assert.deepStrictEqual({ ok: result.ok, calls: service.calls }, { ok: true, calls: [{ kind: 'local', progressId: 'local-cut' }, { kind: 'cleanup', progressId: 'local-cut' }] });
	});

	test('a failed move never emits completed progress', async () => {
		const service = createHarness();
		service.failure = new Error('Permission denied');
		const result = await service.renamePath(remote, '/target/file.txt', { progressId: 'cut' });
		assert.deepStrictEqual({ ok: result.ok, message: result.message, final: service.progress.at(-1) },
			{ ok: false, message: 'Permission denied', final: { phase: 'transfer', strategy: 'remote-copy', state: 'failed' } });
	});

	test('a late native completion after cancel cannot mark the cut successful', async () => {
		const service = createHarness();
		let complete!: () => void;
		service.pending = new Promise<void>(resolve => complete = resolve);
		const result = service.renamePath(remote, '/target/file.txt', { progressId: 'cut' });
		service.canceled = true;
		complete();
		assert.deepStrictEqual({ result: await result, final: service.progress.at(-1) }, {
			result: { ok: false, message: 'Transfer canceled.', canceled: true },
			final: { phase: 'transfer', strategy: 'remote-copy', state: 'canceled' }
		});
	});

	test('ordinary rename callers remain compatible without operation options', async () => {
		const service = createHarness();
		const result = await service.renamePath(remote, '/target/file.txt');
		assert.deepStrictEqual(result, { ok: true, message: 'Path renamed.' });
		assert.strictEqual(service.calls.find(call => call.kind === 'exec')?.command, "mkdir -p '/target' && mv -f '/source/file.txt' '/target/file.txt'");
	});

	test('publishes real move counters and preserves them in the terminal event', async () => {
		for (const failure of [undefined, new Error('Write failed')]) {
			const service = createHarness();
			service.ioChunks = ['TURBOFILE_MOVE_DELTA=214748', '3648\nTURBOFILE_MOVE_DELTA=1024\n'];
			service.failure = failure;
			await service.renamePath(remote, '/target/file.txt', { progressId: 'cut' });
			service.deliverLateStderr?.('TURBOFILE_MOVE_DELTA=9999\n');
			assert.deepStrictEqual(service.bytes, [0, 2147483648, 2147484672, 2147484672]);
		}
	});

	test('forwards local cross-volume deltas without scanning and retains batch totals', async () => {
		for (const batch of [false, true]) {
			const service = createHarness();
			service.deltas = [1024, 2048];
			const source: ITurboFileTransferEndpoint = { kind: 'local', path: '/source/file.txt' };
			if (batch) {
				await service.movePathsIntoDirectory([source], '/target', { progressId: 'cut' });
			} else {
				await service.renamePath(source, '/target/file.txt', { progressId: 'cut' });
			}
			assert.deepStrictEqual(service.bytes, [0, 1024, 3072, 3072]);
		}
	});

	test('legacy multi-item move emits activity and completion around its existing core', async () => {
		const service = createHarness();
		const result = await service.movePathsIntoDirectory([remote], '/target', { progressId: 'batch-cut' });
		assert.deepStrictEqual({ ok: result.ok, calls: service.calls, progress: service.progress }, {
			ok: true,
			calls: [{ kind: 'batch-move', progressId: 'batch-cut' }, { kind: 'cleanup', progressId: 'batch-cut' }],
			progress: [{ phase: 'transfer', strategy: 'remote-copy' }, { phase: 'complete', strategy: 'remote-copy', state: 'completed' }]
		});
	});

	test('legacy multi-item move preserves failure and cancellation states', async () => {
		for (const canceled of [false, true]) {
			const service = createHarness();
			let complete!: () => void;
			service.pending = new Promise<void>(resolve => complete = resolve);
			service.failure = new Error('Permission denied');
			const result = service.movePathsIntoDirectory([remote], '/target', { progressId: 'batch-cut' });
			service.canceled = canceled;
			complete();
			assert.deepStrictEqual({ ok: (await result).ok, final: service.progress.at(-1) }, {
				ok: false, final: { phase: 'transfer', strategy: 'remote-copy', state: canceled ? 'canceled' : 'failed' }
			});
		}
	});
});
