/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { PassThrough } from 'stream';
import { pipeline } from 'stream/promises';
import * as sinon from 'sinon';
import * as ts from 'typescript';
import { localize } from '../../../../nls.js';
import type { ITurboFileBatchTransferItem, ITurboFileBatchTransferRequest, ITurboFileBatchTransferResult, ITurboFileTransferEndpoint, ITurboFileTransferRequest, ITurboFileTransferResult } from '../../common/turbofile.js';
import { createRemoteBatchTarSourcePlan, isTurboFileBatchCommandSafe } from '../../common/turbofileBatchTarPlan.js';
import { TurboFileOperationWatchdog } from '../../common/turbofileOperationWatchdog.js';

interface IDeferred<T> {
	readonly promise: Promise<T>;
	resolve(value: T): void;
	reject(error: Error): void;
}

function deferred<T>(): IDeferred<T> {
	let resolve!: (value: T) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, resolve, reject };
}

type RelaySide = 'source' | 'target';

/** Keep channel close acknowledgments independent from the archive pipeline's EOF. */
class ControlledExecStream extends PassThrough {
	readonly commandClose = deferred<void>();
	abortRequested = false;
	commandFinished = false;

	constructor(readonly side: RelaySide, private readonly events: string[]) {
		super({ autoDestroy: false });
	}

	close(): void {
		this.events.push(`close requested ${this.side}`);
	}

	override destroy(_error?: Error): this {
		this.abortRequested = true;
		this.events.push(`destroy requested ${this.side}`);
		return this;
	}

	finishCommand(): void {
		this.commandFinished = true;
		this.events.push(`closed ${this.side}`);
		this.commandClose.resolve();
		this.emit('close');
	}

	acknowledgeClose(): void {
		this.commandFinished = true;
		this.events.push(`closed ${this.side}`);
		this.commandClose.resolve();
		this.emit('close');
	}
}

interface IRemoteCommandStream {
	readonly stream: ControlledExecStream;
	readonly close: Promise<void>;
}

interface ITarBatchPlan {
	readonly parentPath: string;
	readonly names: readonly string[];
	readonly targetNames: readonly string[];
}

interface IServiceHarness {
	tryRelayBatchTarTransfer(request: ITurboFileBatchTransferRequest, items: readonly ITurboFileBatchTransferItem[], plan: ITarBatchPlan, expectedBytes: number, startedAt: number): Promise<ITurboFileBatchTransferResult | undefined>;
	tryTarRelayTransfer(request: ITurboFileTransferRequest, startedAt: number, forceProtocol: boolean): Promise<ITurboFileTransferResult | undefined>;
}

interface IRelayHarness {
	readonly service: IServiceHarness;
	readonly opens: Record<RelaySide, IDeferred<IRemoteCommandStream>>;
	readonly events: string[];
}

class TransferCanceledError extends Error { }

/** Exercise the real relay entry points and cleanup without importing Electron or starting SSH. */
function createServiceHarness(): IRelayHarness {
	const servicePath = path.join(process.cwd(), 'src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts');
	const source = ts.createSourceFile(servicePath, fs.readFileSync(servicePath, 'utf8'), ts.ScriptTarget.Latest, true);
	const methodNames = new Set(['tryRelayBatchTarTransfer', 'tryTarRelayTransfer', 'relayRemoteStreamsWithWatchdog']);
	const functionNames = new Set(['abortSshExecStreamAndWait', 'createProgressPassThrough']);
	const methods: string[] = [];
	const functions: string[] = [];
	const visit = (node: ts.Node): void => {
		if (ts.isMethodDeclaration(node) && methodNames.has(node.name.getText(source))) {
			methods.push(node.getText(source));
		} else if (ts.isFunctionDeclaration(node) && node.name && functionNames.has(node.name.text)) {
			functions.push(node.getText(source));
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
	assert.deepStrictEqual({ methods: methods.length, functions: functions.length }, { methods: methodNames.size, functions: functionNames.size });
	const code = ts.transpileModule(`
		const sshExecStreamAbortPromises = new WeakMap();
		${functions.join('\n')}
		class Harness { constructor(hooks) { Object.assign(this, hooks); } ${methods.join('\n')} }
	`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
	const events: string[] = [];
	const opens = { source: deferred<IRemoteCommandStream>(), target: deferred<IRemoteCommandStream>() };
	const createLease = (side: RelaySide) => ({
		session: { client: side },
		release: () => events.push(`released ${side}`)
	});
	const hooks = {
		acquireTransferSessionPair: async () => [createLease('source'), createLease('target')],
		registerTransferCancelHandler: () => () => { },
		throwIfTransferCanceled: () => { },
		isTransferCanceled: () => false,
		markTransferDataStarted: () => events.push('data started'),
		fireTransferProgress: (_request: ITurboFileTransferRequest, _bytes: number, _total: number, phase: string) => {
			if (phase === 'complete') {
				events.push('complete');
			}
		},
		openRemoteCommandStream: async (side: RelaySide) => {
			try {
				const result = await opens[side].promise;
				events.push(`opened ${side}`);
				return result;
			} catch (error) {
				events.push(`open failed ${side}`);
				throw error;
			}
		},
		getRemotePathContentSizeByCommand: async () => 5,
		clearRemoteDirectoryListingCache: () => { },
		createTransferResult: (ok: boolean, strategy: ITurboFileTransferResult['strategy'], bytes: number, message: string): ITurboFileTransferResult => ({ ok, strategy, bytes, message }),
		createBatchTransferResult: (ok: boolean, strategy: ITurboFileTransferResult['strategy'], bytes: number, message: string, completed: number, failed: number): ITurboFileBatchTransferResult => ({ ok, strategy, bytes, message, completed, failed, failures: [] })
	};
	// Shell command builders are outside this lifecycle boundary; no returned command is executed.
	const dependencies = {
		PassThrough, pipeline, localize, TurboFileOperationWatchdog,
		TurboFileTransferCanceledError: TransferCanceledError,
		createRemoteBatchTarSourcePlan, isTurboFileBatchCommandSafe,
		buildTarCreateFromDirectoryCommand: () => 'create archive',
		buildTarExtractToExactDirectoryCommand: () => 'extract archive',
		buildTarExtractToDirectoryCommand: () => 'extract batch archive',
		getSshToSshTransferProtocol: () => 'tar',
		looksLikeWindowsPath: () => false,
		formatTransferError: (error: Error) => error.message,
		REMOTE_DIRECTORY_TRANSFER_INACTIVITY_TIMEOUT_MS: 120000
	};
	const Harness: new (hooks: object) => IServiceHarness = new Function('dependencies', `const { ${Object.keys(dependencies).join(', ')} } = dependencies; ${code}; return Harness;`)(dependencies);
	return { service: new Harness(hooks), opens, events };
}

const sourceEndpoint: ITurboFileTransferEndpoint = { kind: 'ssh', path: '/source/tree', connection: { host: 'source.example', port: 22, username: 'user' } };
const targetEndpoint: ITurboFileTransferEndpoint = { kind: 'ssh', path: '/target/tree', connection: { host: 'target.example', port: 22, username: 'user' } };
const items: ITurboFileBatchTransferItem[] = [{ sourcePath: sourceEndpoint.path, sourceType: 'directory', targetName: 'tree' }];

function startTransfer(service: IServiceHarness, batch: boolean): Promise<ITurboFileTransferResult | ITurboFileBatchTransferResult | undefined> {
	if (batch) {
		return service.tryRelayBatchTarTransfer({ source: sourceEndpoint, targetDirectory: targetEndpoint, items }, items, { parentPath: '/source', names: ['tree'], targetNames: ['tree'] }, 5, 0);
	}
	return service.tryTarRelayTransfer({ source: sourceEndpoint, target: targetEndpoint, sourceType: 'directory', expectedBytes: 5 }, 0, true);
}

suite('TurboFileTarRelayLifecycle', () => {
	let clock: sinon.SinonFakeTimers;

	setup(() => {
		clock = sinon.useFakeTimers();
	});

	teardown(() => {
		clock.restore();
	});

	for (const batch of [false, true]) {
		const entryPoint = batch ? 'batch' : 'directory';
		for (const failedSide of ['source', 'target'] as const) {
			test(`${entryPoint} relay waits for a late channel and its close before releasing leases when ${failedSide} open fails`, async () => {
				const { service, opens, events } = createServiceHarness();
				const lateSide = failedSide === 'source' ? 'target' : 'source';
				const lateStream = new ControlledExecStream(lateSide, events);
				let settled = false;
				const transfer = startTransfer(service, batch).finally(() => settled = true);
				const failure = assert.rejects(transfer, /channel open failed/);
				await clock.tickAsync(0);
				opens[failedSide].reject(new Error('channel open failed'));
				await clock.tickAsync(0);
				const settledBeforeLateOpen = settled;
				opens[lateSide].resolve({ stream: lateStream, close: lateStream.commandClose.promise });
				await clock.tickAsync(0);
				const settledBeforeClose = settled;
				lateStream.acknowledgeClose();
				await failure;
				assert.deepStrictEqual({ settledBeforeLateOpen, settledBeforeClose, abortRequested: lateStream.abortRequested, events, timers: clock.countTimers() }, {
					settledBeforeLateOpen: false,
					settledBeforeClose: false,
					abortRequested: true,
					events: [`open failed ${failedSide}`, `opened ${lateSide}`, `close requested ${lateSide}`, `destroy requested ${lateSide}`, `closed ${lateSide}`, 'released source', 'released target'],
					timers: 0
				});
			});
		}

		test(`${entryPoint} relay does not complete on archive EOF until both remote commands exit`, async () => {
			const { service, opens, events } = createServiceHarness();
			const sourceStream = new ControlledExecStream('source', events);
			const targetStream = new ControlledExecStream('target', events);
			let settled = false;
			const transfer = startTransfer(service, batch).finally(() => settled = true);
			opens.source.resolve({ stream: sourceStream, close: sourceStream.commandClose.promise });
			opens.target.resolve({ stream: targetStream, close: targetStream.commandClose.promise });
			await clock.tickAsync(0);
			sourceStream.end(Buffer.from('hello'));
			await clock.tickAsync(0);
			const settledAtEof = settled;
			sourceStream.finishCommand();
			await clock.tickAsync(0);
			const settledAfterSourceExit = settled;
			targetStream.finishCommand();
			await clock.tickAsync(0);
			const settledAfterBothExits = settled;
			if (!settled) {
				// Finish a regressed abort timeout so the assertion reports it instead of hanging Mocha.
				await clock.tickAsync(3000);
			}
			const result = await transfer;
			const lifecycleEvents = events.filter(event => !event.startsWith('close requested ') && !event.startsWith('destroy requested '));
			assert.deepStrictEqual({ settledAtEof, settledAfterSourceExit, settledAfterBothExits, ok: result?.ok, bytes: result?.bytes, events: lifecycleEvents, timers: clock.countTimers() }, {
				settledAtEof: false,
				settledAfterSourceExit: false,
				settledAfterBothExits: true,
				ok: true,
				bytes: 5,
				events: ['opened source', 'opened target', 'data started', 'closed source', 'closed target', 'complete', 'released source', 'released target'],
				timers: 0
			});
		});
	}
});
