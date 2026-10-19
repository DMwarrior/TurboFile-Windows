/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import { localize } from '../../../../nls.js';
import { ITurboFileTransferProgressEvent, ITurboFileTransferRequest, ITurboFileTransferResult } from '../../common/turbofile.js';
import { classifyTurboFileTransferFailure, getTurboFileTransferErrorMessage, shouldContinueTurboFileTransferPlan } from '../../common/turbofileTransferFailure.js';

interface IHarness {
	readonly attempts: string[];
	readonly events: Partial<ITurboFileTransferProgressEvent>[];
	readonly timingResets: number;
	readonly transferProgressSnapshots: Map<string, { lastAt: number; lastBytes: number; lastTotal?: number; strategy?: ITurboFileTransferResult['strategy'] }>;
	tryLocalToSshTarTransfer(request: ITurboFileTransferRequest, expectedBytes: number, startedAt: number): Promise<ITurboFileTransferResult | undefined>;
	trySshToLocalTarTransfer(request: ITurboFileTransferRequest, expectedBytes: number, startedAt: number): Promise<ITurboFileTransferResult | undefined>;
	fastTransferWithFallback(bytes: number, onDelta: ((delta: number) => void) | undefined, progressId: string, primary: (report: (delta: number) => void) => Promise<void>, fallback: (report: (delta: number) => void) => Promise<void>): Promise<void>;
}

/** Replays the transport fallback decisions, with storage and transport failures controlled. */
function createHarness(failure: Error): IHarness {
	const file = path.join(process.cwd(), 'src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts');
	const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
	const names = new Set(['tryLocalToSshTarTransfer', 'trySshToLocalTarTransfer', 'fastTransferWithFallback', 'reportTransferFallback']);
	const declarations = new Set(['shouldPreferTarForMultiItemTransfer', 'TurboFileTransferCanceledError']);
	const methods: string[] = [];
	const helpers: string[] = [];
	const visit = (node: ts.Node): void => {
		if (ts.isMethodDeclaration(node) && names.has(node.name.getText(source))) {
			methods.push(node.getText(source));
		}
		if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name && declarations.has(node.name.text)) {
			helpers.push(node.getText(source));
		}
		if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'SFTP_LARGE_FILE_THRESHOLD') {
			helpers.push(`const ${node.getText(source)};`);
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
	assert.deepStrictEqual({ methods: methods.length, helpers: helpers.length }, { methods: names.size, helpers: declarations.size + 1 });
	const code = ts.transpileModule(`${helpers.join('\n')}
		class Harness {
			attempts = []; events = []; timingResets = 0; transferProgressSnapshots = new Map();
			isTransferCanceled() { return false; }
			throwIfTransferCanceled() {}
			clearTransferDataTiming() { this.timingResets++; }
			markTransferDataStarted() {}
			fireTransferProgress(request, bytes, total, phase, detail, force, extra) { this.events.push({ transferredBytes: bytes, totalBytes: total, phase, detail, ...extra }); }
			async runLocalDirectoryTarUpload() { this.attempts.push('tar-upload'); throw failure; }
			async runRemoteDirectoryTarDownload() { this.attempts.push('tar-download'); throw failure; }
			${methods.join('\n')}
		}`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
	const Harness: new () => IHarness = new Function('failure', 'classifyTurboFileTransferFailure', 'shouldContinueTurboFileTransferPlan', 'fsp', 'looksLikeWindowsPath', 'ensureLocalDirectory', 'TRANSFER_CANCELED_MESSAGE', 'localize', 'formatTransferError', `${code}; return Harness;`)(
		failure, classifyTurboFileTransferFailure, shouldContinueTurboFileTransferPlan,
		{ stat: async () => ({ isDirectory: () => true }), rm: async () => undefined },
		() => false, async () => undefined, 'Transfer canceled.', localize, getTurboFileTransferErrorMessage
	);
	return new Harness();
}

const remote = { kind: 'ssh' as const, path: '/fixture', preferredProtocol: 'tar' as const, supportsTar: true, connection: { host: 'fixture', port: 22, username: 'fixture' } };
const local = { kind: 'local' as const, path: '/fixture' };

suite('TurboFileProtocolFallback', () => {
	const terminalFailures = [
		['permission', 'tar: /source/locked.pyc: Permission denied'],
		['no-space', 'tar: /target/file: No space left on device'],
		['source-changed', 'tar: file changed as we read it'],
		['conflict', 'scp: /target/file: Is a directory'],
		['path-unavailable', 'tar: /source/removed: Cannot stat: No such file or directory'],
		['authentication', 'Permission denied (publickey,password).']
	] as const;
	const recoverableFailures = [
		['protocol-unavailable', 'tar: command not found'],
		['missing-native-tool', 'spawn tar.exe ENOENT'],
		['wrapped-missing-native-tool', 'Native tar upload failed: spawn C:\\Program Files\\OpenSSH\\ssh.exe ENOENT'],
		['network-transient', 'SSH connection reset by peer']
	] as const;

	for (const direction of ['upload', 'download'] as const) {
		const request: ITurboFileTransferRequest = {
			source: direction === 'upload' ? local : remote,
			target: direction === 'upload' ? remote : local,
			sourceType: 'directory', progressId: `tar-${direction}`
		};
		for (const [category, message] of terminalFailures) {
			test(`tar ${direction} retains ${category} instead of requesting another protocol`, async () => {
				const failure = new Error(message);
				const service = createHarness(failure);
				await assert.rejects(direction === 'upload'
					? service.tryLocalToSshTarTransfer(request, 1024, 0)
					: service.trySshToLocalTarTransfer(request, 1024, 0), error => error === failure);
				assert.deepStrictEqual({ attempts: service.attempts, timingResets: service.timingResets }, { attempts: [`tar-${direction}`], timingResets: 0 });
			});
		}
		for (const [category, message] of recoverableFailures) {
			test(`tar ${direction} permits protocol fallback after ${category}`, async () => {
				const service = createHarness(new Error(message));
				const result = direction === 'upload'
					? await service.tryLocalToSshTarTransfer(request, 1024, 0)
					: await service.trySshToLocalTarTransfer(request, 1024, 0);
				const fallback = service.events.at(-1);
				assert.deepStrictEqual({ result, attempts: service.attempts, timingResets: service.timingResets, state: fallback?.state, strategy: fallback?.strategy, causePreserved: fallback?.detail?.includes(message) }, {
					result: undefined, attempts: [`tar-${direction}`], timingResets: 1, state: 'fallback', strategy: direction === 'upload' ? 'sftp-upload' : 'sftp-download', causePreserved: true
				});
			});
		}
	}

	for (const [category, message] of terminalFailures) {
		test(`SFTP compatibility settings cannot retry ${category}`, async () => {
			const failure = new Error(message);
			const service = createHarness(failure);
			let fallbackCalls = 0;
			await assert.rejects(service.fastTransferWithFallback(1024 * 1024 * 1024, undefined, 'sftp', async () => { throw failure; }, async () => { fallbackCalls++; }), error => error === failure);
			assert.strictEqual(fallbackCalls, 0);
		});
	}

	for (const [category, message] of recoverableFailures) {
		test(`SFTP compatibility settings may recover from ${category} without duplicating progress`, async () => {
			const failure = new Error(message);
			const service = createHarness(failure);
			let fallbackCalls = 0;
			const deltas: number[] = [];
			service.transferProgressSnapshots.set('sftp', { lastAt: 0, lastBytes: 128, lastTotal: 1024 * 1024 * 1024, strategy: 'sftp-upload' });
			await service.fastTransferWithFallback(1024 * 1024 * 1024, delta => deltas.push(delta), 'sftp', async report => {
				report(128);
				throw failure;
			}, async report => {
				fallbackCalls++;
				report(64);
				report(96);
			});
			const fallback = service.events.at(-1);
			assert.deepStrictEqual({ fallbackCalls, deltas, state: fallback?.state, strategy: fallback?.strategy, transferredBytes: fallback?.transferredBytes, causePreserved: fallback?.detail?.includes(message) }, {
				fallbackCalls: 1, deltas: [128, 32], state: 'fallback', strategy: 'sftp-upload', transferredBytes: 128, causePreserved: true
			});
		});
	}
});
