/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as sinon from 'sinon';
import * as ts from 'typescript';
import { localize } from '../../../../nls.js';
import type { ITurboFileTransferEndpoint, ITurboFileTransferRequest, ITurboFileTransferResult } from '../../common/turbofile.js';

interface IVerificationOptions {
	readonly targetType?: 'file' | 'directory';
	readonly targetSize?: number;
	readonly sourceSize?: number;
	readonly targetStatError?: Error;
	readonly commandSizeError?: Error;
	readonly contentSizeError?: Error;
	readonly contentBytes?: number;
	readonly sampledBytes?: number;
	readonly useRealDirectoryGrowth?: boolean;
	readonly onTransfer?: (getActivityTime: () => number, onActivity: (() => void) | undefined) => Promise<void>;
}

interface IVerificationHarness {
	readonly events: string[];
	readonly progressBytes: number[];
	deletedTargets: number;
	targetStatCalls: number;
	verifySshUploadSize(target: ITurboFileTransferEndpoint, expectedBytes: number, label: string, progressId: string): Promise<void>;
	tryDirectSftpTransferRoute(request: ITurboFileTransferRequest, startedAt: number, route: 'source-push' | 'target-pull'): Promise<ITurboFileTransferResult>;
	tryDirectScpTransferRoute(request: ITurboFileTransferRequest, startedAt: number, sourceIsDirectory: boolean, bytes: number, route: 'source-push' | 'target-pull'): Promise<ITurboFileTransferResult>;
}

/** Replay actual verification and transfer methods without connecting SSH or loading Electron. */
function createVerificationHarness(options: IVerificationOptions): IVerificationHarness {
	const servicePath = path.join(process.cwd(), 'src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts');
	const source = ts.createSourceFile(servicePath, fs.readFileSync(servicePath, 'utf8'), ts.ScriptTarget.Latest, true);
	const names = new Set(['verifySshUploadSize', 'tryDirectSftpTransferRoute', 'tryDirectScpTransferRoute', 'beginRemotePathGrowthTiming']);
	const methods: string[] = [];
	const visit = (node: ts.Node): void => {
		if (ts.isMethodDeclaration(node) && names.has(node.name.getText(source))) {
			// Keep the real directory probe available alongside the controlled probe used by other cases.
			methods.push(node.name.getText(source) === 'beginRemotePathGrowthTiming'
				? node.getText(source).replace('beginRemotePathGrowthTiming', 'beginActualRemotePathGrowthTiming')
				: node.getText(source));
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
	assert.strictEqual(methods.length, names.size);
	const code = ts.transpileModule(`
		class TurboFileTransferCanceledError extends Error {}
		class Harness {
			events = [];
			progressBytes = [];
			deletedTargets = 0;
			targetStatCalls = 0;
			throwIfTransferCanceled() {}
			isTransferCanceled() { return false; }
			async acquireTransferSession() { return { session: { client: {}, sftp: {} }, release: () => this.events.push('release-session') }; }
			acquirePreparedDirectSshControlConnection() { return { controlPath: undefined, release: () => this.events.push('release-control') }; }
			async prepareRemoteScpCredential() { return { cleanupCommand: '', activePath: '/test/credential.active' }; }
			scheduleDirectProbeCredentialCleanup() {}
			hasFreshRemoteDirectoryListing() { return true; }
			async prepareDirectTargetWithWarmSession() { return true; }
			async withDirectorySftp(endpoint, callback) { return callback({}); }
			async remoteStat(sftp, remotePath) {
				if (remotePath.startsWith('/source/')) { return { size: options.sourceSize ?? 7, isFile: () => true, isDirectory: () => false }; }
				this.targetStatCalls++;
				this.events.push('target-stat');
				if (options.targetStatError) { throw options.targetStatError; }
				return { size: options.targetSize ?? 7, isFile: () => options.targetType !== 'directory', isDirectory: () => options.targetType === 'directory' };
			}
			async getRemotePathSizeByCommand(endpoint, progressId, fileOnly = false) {
				if (endpoint.path.startsWith('/source/')) { return options.sourceSize ?? 7; }
				this.events.push('target-command-size');
				if (options.commandSizeError) { throw options.commandSizeError; }
				if (fileOnly && options.targetType === 'directory') { throw new Error('Target is a directory'); }
				return options.targetSize ?? 7;
			}
			async getRemotePathContentSizeByCommand(endpoint) {
				this.events.push('target-content-size');
				if (options.contentSizeError) { throw options.contentSizeError; }
				if (options.commandSizeError) { throw options.commandSizeError; }
				return options.contentBytes ?? options.targetSize ?? 7;
			}
			async deletePathCore() { this.deletedTargets++; }
			async unlinkRemote() { this.deletedTargets++; }
			async execRemote(_client, _command, executionOptions) {
				await this.growthSample;
				if (executionOptions.getActivityTime) { await options.onTransfer?.(executionOptions.getActivityTime, this.growthActivity); }
				this.events.push('command-completed');
			}
			markTransferDataStarted() {}
			fireTransferProgress(_request, bytes) { this.progressBytes.push(bytes); }
			beginTransferGrowthTiming(progressId, probeSize, baseline, expected, report, pollInterval, initialDelay, initialPollInterval, onActivity) {
				this.growthActivity = onActivity;
				this.growthSample = probeSize().then(bytes => report(bytes));
				void this.growthSample.catch(() => undefined);
				return this.beginGrowthTiming();
			}
			beginRemoteFileGrowthTiming(progressId, connection, path, baseline, expected, report, pollInterval, initialDelay, onActivity) {
				this.growthActivity = onActivity;
				return this.beginGrowthTiming();
			}
			beginRemotePathGrowthTiming(progressId, endpoint, baseline, expected, report, pollInterval, initialDelay, onActivity) {
				if (options.useRealDirectoryGrowth) {
					return this.beginActualRemotePathGrowthTiming(progressId, endpoint, baseline, expected, report, pollInterval, initialDelay, onActivity);
				}
				this.growthActivity = onActivity;
				if (options.sampledBytes !== undefined) { report(options.sampledBytes); }
				return this.beginGrowthTiming();
			}
			beginGrowthTiming() {
				let active = true;
				return () => { if (active) { active = false; this.events.push('stop-growth'); } };
			}
			createTransferResult(ok, strategy, bytes, message) { return { ok, strategy, bytes, message }; }
			${methods.join('\n')}
		}`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
	const Harness: new () => IVerificationHarness = new Function(
		'options', 'localize', 'getRemoteParentPath', 'buildPortablePosixRm', 'buildPortablePosixMkdir',
		'buildSshpassPrefix', 'buildOptimizedSftpCommand', 'buildCompatibleSshCommand', 'wrapRemoteCredentialCommand',
		'quoteSftpBatchPath', 'quotePosixShellArg', 'getRemoteDirectoryContentsPath', 'ensureTrailingRemoteSlash', 'getFileTypeFromStats',
		'DIRECT_TRANSFER_STALL_TIMEOUT_MS', 'REMOTE_DIRECTORY_TRANSFER_INACTIVITY_TIMEOUT_MS', 'REMOTE_FILE_TRANSFER_INACTIVITY_TIMEOUT_MS',
		'escapeLegacyScpRemotePath', 'buildDirectScpSshCommand', 'buildDirectScpCommand', 'TRANSFER_PROGRESS_EVENT_INTERVAL_MS',
		`${code}; return Harness;`
	)(options, localize, path.posix.dirname, () => 'rm', () => 'mkdir',
		() => '', () => 'sftp', () => 'ssh', (command: string) => command,
		(value: string) => JSON.stringify(value), (value: string) => JSON.stringify(value),
		(value: string) => `${value}/.`, (value: string) => `${value}/`, () => 'file',
		1000, 1000, 1000, (value: string) => value, () => 'ssh', () => 'scp', 500);
	return new Harness();
}

function request(sourceType: 'file' | 'directory', expectedBytes: number): ITurboFileTransferRequest {
	return {
		source: { kind: 'ssh', path: '/source/item', connection: { host: 'source', port: 22, username: 'source-user' } },
		target: { kind: 'ssh', path: '/target/item', connection: { host: 'target', port: 22, username: 'target-user' } },
		sourceType,
		expectedBytes,
		progressId: 'verification-test'
	};
}

suite('TurboFileTransferVerification', () => {
	test('upload size mismatch never deletes a user target', async () => {
		const service = createVerificationHarness({ targetSize: 3 });
		await assert.rejects(service.verifySshUploadSize(request('file', 7).target, 7, 'SFTP upload', 'verification-test'), /size mismatch/);
		assert.strictEqual(service.deletedTargets, 0);
	});

	test('file upload cannot validate against the size of an existing directory', async () => {
		const service = createVerificationHarness({ targetType: 'directory', targetSize: 7 });
		await assert.rejects(service.verifySshUploadSize(request('file', 7).target, 7, 'SFTP upload', 'verification-test'), /directory|file type|目录/i);
		assert.strictEqual(service.deletedTargets, 0);
	});

	test('direct SFTP fails when both target stat mechanisms fail', async () => {
		const commandSizeError = new Error('Remote stat command failed');
		const service = createVerificationHarness({ targetStatError: new Error('Remote STAT unavailable'), commandSizeError });
		await assert.rejects(service.tryDirectSftpTransferRoute(request('file', 7), Date.now(), 'source-push'), /Remote stat command failed/);
		assert.deepStrictEqual({ deletes: service.deletedTargets, queried: service.targetStatCalls > 0 }, { deletes: 0, queried: true });
	});

	test('direct SFTP never confirms a directory whose metadata size equals the source file', async () => {
		const service = createVerificationHarness({ targetType: 'directory', targetSize: 7 });
		await assert.rejects(service.tryDirectSftpTransferRoute(request('file', 7), Date.now(), 'source-push'), /directory|file type|目录/i);
		assert.strictEqual(service.deletedTargets, 0);
	});

	test('shell fallback cannot validate directory content bytes as a file after SFTP STAT fails', async () => {
		const service = createVerificationHarness({ targetType: 'directory', targetSize: 7, targetStatError: new Error('SFTP STAT unavailable') });
		await assert.rejects(service.verifySshUploadSize(request('file', 7).target, 7, 'SFTP upload', 'verification-test'), /directory|file type|目录/i);
		assert.deepStrictEqual({ deletes: service.deletedTargets, statCalls: service.targetStatCalls }, { deletes: 0, statCalls: 1 });
	});

	test('zero-byte direct SFTP files must match an empty target', async () => {
		const service = createVerificationHarness({ sourceSize: 0, targetSize: 3 });
		await assert.rejects(service.tryDirectSftpTransferRoute(request('file', 0), Date.now(), 'source-push'), /size mismatch: expected 0, got 3/);
		assert.strictEqual(service.deletedTargets, 0);
	});

	test('a correctly empty direct SFTP file still verifies its target', async () => {
		const service = createVerificationHarness({ sourceSize: 0, targetSize: 0 });
		const result = await service.tryDirectSftpTransferRoute(request('file', 0), Date.now(), 'source-push');
		assert.deepStrictEqual({ ok: result.ok, bytes: result.bytes, queried: service.targetStatCalls > 0 }, { ok: true, bytes: 0, queried: true });
	});

	test('unknown directory totals retain observed bytes without a final directory scan', async () => {
		const contentBytes = 8 * 1024 * 1024;
		const service = createVerificationHarness({ sampledBytes: 8199, contentBytes });
		const result = await service.tryDirectSftpTransferRoute(request('directory', 0), Date.now(), 'source-push');
		assert.deepStrictEqual({
			ok: result.ok,
			bytes: result.bytes,
			stopped: service.events.includes('stop-growth'),
			finalScan: service.events.includes('target-content-size')
		}, { ok: true, bytes: 8199, stopped: true, finalScan: false });
	});

	test('a completed unknown-size directory copy does not depend on a new final size probe', async () => {
		const service = createVerificationHarness({ sampledBytes: 8199, contentSizeError: new Error('Final content size unavailable') });
		const result = await service.tryDirectSftpTransferRoute(request('directory', 0), Date.now(), 'source-push');
		assert.deepStrictEqual({ ok: result.ok, bytes: result.bytes, deletes: service.deletedTargets, finalScan: service.events.includes('target-content-size') },
			{ ok: true, bytes: 8199, deletes: 0, finalScan: false });
	});

	test('direct SFTP wires file and directory activity to the command timeout independently of displayed bytes', async () => {
		const clock = sinon.useFakeTimers();
		try {
			for (const sourceType of ['file', 'directory'] as const) {
				for (const route of ['source-push', 'target-pull'] as const) {
					const initialTime = clock.now;
					const service = createVerificationHarness({ sampledBytes: 7, onTransfer: async (getActivityTime, onActivity) => {
						assert.strictEqual(typeof onActivity, 'function');
						await clock.tickAsync(60000);
						assert.strictEqual(getActivityTime(), initialTime, 'An old displayed peak cannot refresh the activity clock');
						onActivity!();
						assert.strictEqual(getActivityTime(), clock.now);
						await clock.tickAsync(60000);
						onActivity!();
						assert.strictEqual(getActivityTime(), clock.now);
					} });
					const result = await service.tryDirectSftpTransferRoute(request(sourceType, 7), clock.now, route);
					assert.strictEqual(result.ok, true);
				}
			}
		} finally {
			clock.restore();
		}
	});

	test('direct directory monitoring preserves the existing coarse size probe', async () => {
		const contentBytes = 268436086;
		const metadataInclusiveBytes = 268448186;
		for (const protocol of ['scp', 'sftp'] as const) {
			for (const route of ['source-push', 'target-pull'] as const) {
				const service = createVerificationHarness({ targetType: 'directory', targetSize: metadataInclusiveBytes, contentBytes, useRealDirectoryGrowth: true });
				const transferRequest = request('directory', 0);
				const result = protocol === 'scp'
					? await service.tryDirectScpTransferRoute(transferRequest, Date.now(), true, 0, route)
					: await service.tryDirectSftpTransferRoute(transferRequest, Date.now(), route);
				assert.deepStrictEqual({
					ok: result.ok,
					bytes: result.bytes,
					progress: service.progressBytes,
					metadataProbes: service.events.filter(event => event === 'target-command-size').length,
					contentProbes: service.events.filter(event => event === 'target-content-size').length
				}, protocol === 'scp'
					? { ok: true, bytes: contentBytes, progress: [0, metadataInclusiveBytes, contentBytes], metadataProbes: 1, contentProbes: 1 }
					: { ok: true, bytes: metadataInclusiveBytes, progress: [0, metadataInclusiveBytes, metadataInclusiveBytes], metadataProbes: 1, contentProbes: 0 });
			}
		}
	});
});
