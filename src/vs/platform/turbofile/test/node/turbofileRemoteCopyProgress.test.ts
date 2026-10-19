/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import * as ts from 'typescript';
import { ITurboFileTransferRequest, TurboFileFileType } from '../../common/turbofile.js';

interface IRemoteCopyOptions {
	readonly onStderr: (chunk: string) => void;
}

interface IProgressEvent {
	readonly bytes: number;
	readonly total: number;
}

interface IRemoteCopyHarness {
	execRemoteCopyWithProgress(request: ITurboFileTransferRequest, command: string, bytes: number, sourceType: TurboFileFileType, reportsNativeProgress: boolean): Promise<number>;
	withDirectorySshClient(endpoint: object, run: (client: object) => Promise<void>): Promise<void>;
	withOwnedRemoteProcess(client: object, progressId: string | undefined, run: () => Promise<void>): Promise<void>;
	execRemote(client: object, command: string, options: IRemoteCopyOptions): Promise<void>;
	fireTransferProgress(request: object, bytes: number, total: number): void;
	beginTransferGrowthTiming(): () => void;
}

interface IProgressImplementation {
	readonly Service: new () => IRemoteCopyHarness;
	readonly parse: (output: string) => number;
	readonly command: (source: string, target: string, reportProgress: boolean) => string;
}

/** Exercise the actual service callback and shell builder without loading Electron. */
function loadProgressImplementation(): IProgressImplementation {
	const servicePath = path.join(process.cwd(), 'src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts');
	const source = ts.createSourceFile(servicePath, fs.readFileSync(servicePath, 'utf8'), ts.ScriptTarget.Latest, true);
	const functions: string[] = [];
	let method = '';
	const visit = (node: ts.Node): void => {
		if (ts.isMethodDeclaration(node) && node.name.getText(source) === 'execRemoteCopyWithProgress') {
			method = node.getText(source);
		}
		if (ts.isFunctionDeclaration(node) && node.name && ['parseRemoteCopyProgressBytes', 'buildPosixCopyCommand', 'quotePosixShellArg'].includes(node.name.text)) {
			functions.push(node.getText(source));
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
	assert.ok(method && functions.length === 3, 'Missing remote-copy implementation');
	const implementation = ts.transpileModule(`${functions.join('\n')}\nclass Service { ${method} }`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
	return new Function('localize', 'getRemoteParentPath', 'TRANSFER_PROGRESS_EVENT_INTERVAL_MS', 'REMOTE_DIRECTORY_TRANSFER_INACTIVITY_TIMEOUT_MS', 'REMOTE_FILE_TRANSFER_INACTIVITY_TIMEOUT_MS', 'looksLikeWindowsPath', `${implementation}\nreturn { Service, parse: parseRemoteCopyProgressBytes, command: buildPosixCopyCommand };`)(
		(_key: string, message: string) => message, (value: string) => path.posix.dirname(value), 250, 120000, 120000, () => false
	) as IProgressImplementation;
}

suite('TurboFileRemoteCopyProgress', () => {
	let implementation: IProgressImplementation;
	const request: ITurboFileTransferRequest = {
		source: { kind: 'ssh', path: '/source/directory' },
		target: { kind: 'ssh', path: '/target/directory' },
		progressId: 'native-copy-progress'
	};

	suiteSetup(() => { implementation = loadProgressImplementation(); });

	function createHarness(chunks: readonly string[], failure?: Error): { service: IRemoteCopyHarness; events: IProgressEvent[] } {
		const events: IProgressEvent[] = [];
		const service = new implementation.Service();
		service.withDirectorySshClient = async (_endpoint, run) => run({});
		service.withOwnedRemoteProcess = async (_client, _progressId, run) => run();
		service.execRemote = async (_client, _command, options) => {
			for (const chunk of chunks) {
				options.onStderr(chunk);
			}
			if (failure) {
				throw failure;
			}
		};
		service.fireTransferProgress = (_request, bytes, total) => events.push({ bytes, total });
		service.beginTransferGrowthTiming = () => { throw new Error('Native copy must not recursively scan directories for progress.'); };
		return { service, events };
	}

	test('retains exact counters above 2 GiB and across adjacent records', () => {
		assert.strictEqual(implementation.parse('TURBOFILE_COPY_BYTES=2147483648\nTURBOFILE_COPY_BYTES=31000000001\n'), 31000000001);
	});

	test('rejects partial numbers, scientific notation, unsafe integers and diagnostic lookalikes', () => {
		const samples = [
			'TURBOFILE_COPY_BYTES=31000',
			'TURBOFILE_COPY_BYTES=3.1e+10\n',
			'TURBOFILE_COPY_BYTES=9007199254740992\n',
			'cp: TURBOFILE_COPY_BYTES=12345\n',
			'TURBOFILE_COPY_BYTES=12345 invalid\n'
		];
		assert.deepStrictEqual(samples.map(output => implementation.parse(output)), [0, 0, 0, 0, 0]);
	});

	test('reassembles SSH fragments and continues unknown-total progress above 2 GiB', async () => {
		const { service, events } = createHarness([
			'TURBOFILE_COPY_BY', 'TES=214748', '3648\n',
			'TURBOFILE_COPY_BYTES=31000', '000001\r', '\n',
			'TURBOFILE_COPY_BYTES=1\n', 'TURBOFILE_COPY_BYTES=31000000002\n'
		]);
		const copied = await service.execRemoteCopyWithProgress(request, 'native-copy', 0, 'directory', true);
		assert.deepStrictEqual({ copied, events }, {
			copied: 31000000002,
			events: [{ bytes: 2147483648, total: 0 }, { bytes: 31000000001, total: 0 }, { bytes: 31000000002, total: 0 }]
		});
	});

	test('does not report a truncated trailing sample as copied data', async () => {
		const { service, events } = createHarness(['TURBOFILE_COPY_BYTES=1000\nTURBOFILE_COPY_BYTES=31000']);
		const copied = await service.execRemoteCopyWithProgress(request, 'native-copy', 0, 'directory', true);
		assert.deepStrictEqual({ copied, events }, { copied: 1000, events: [{ bytes: 1000, total: 0 }] });
	});

	test('bounds known-total progress without losing the observed counter', async () => {
		const { service, events } = createHarness(['TURBOFILE_COPY_BYTES=31000000001\n']);
		const copied = await service.execRemoteCopyWithProgress(request, 'native-copy', 30000000000, 'directory', true);
		assert.deepStrictEqual({ copied, events }, { copied: 31000000001, events: [{ bytes: 30000000000, total: 30000000000 }] });
	});

	test('propagates native command failure after progress rather than reporting success', async () => {
		const failure = new Error('copy canceled');
		const { service } = createHarness(['TURBOFILE_COPY_BYTES=31000000001\n'], failure);
		await assert.rejects(service.execRemoteCopyWithProgress(request, 'native-copy', 0, 'directory', true), error => error === failure);
	});

	for (const failed of [false, true]) {
		test(`ignores stderr delivered after native command ${failed ? 'failure or cancellation' : 'completion'}`, async () => {
			const { service, events } = createHarness([]);
			let deliverLateStderr = (_chunk: string): void => { throw new Error('Progress handler was not registered.'); };
			service.execRemote = async (_client, _command, options) => {
				deliverLateStderr = options.onStderr;
				options.onStderr('TURBOFILE_COPY_BYTES=2147483648\n');
				if (failed) {
					throw new Error('copy canceled');
				}
			};
			const operation = service.execRemoteCopyWithProgress(request, 'native-copy', 0, 'directory', true);
			if (failed) {
				await assert.rejects(operation, /copy canceled/);
			} else {
				await operation;
			}
			deliverLateStderr('TURBOFILE_COPY_BYTES=31000000001\n');
			assert.deepStrictEqual(events, [{ bytes: 2147483648, total: 0 }]);
		});
	}

	test('keeps native reflink and sparse copy with bounded process-counter sampling', () => {
		const command = implementation.command('/source/directory', '/target/directory', true);
		assert.ok(command.includes('cp -a --reflink=auto --sparse=always'));
		assert.ok(command.includes('printf "%.0f\\n", m+0'));
		assert.ok(command.includes('/proc/$tf_copy_pid/io'));
		assert.ok(!command.includes('du ') && !command.includes('find '));
	});

	test('emits exact large counters through the generated awk program', function () {
		if (process.platform === 'win32') {
			this.skip();
		}
		const command = implementation.command('/source/directory', '/target/directory', true);
		const awkProgram = /tf_copy_bytes=\$\(awk '([^']+)'/.exec(command)?.[1];
		assert.ok(awkProgram);
		const result = spawnSync('awk', [awkProgram], { input: 'rchar: 31000000001\nwchar: 31000000000\nread_bytes: 0\nwrite_bytes: 0\n', encoding: 'utf8' });
		assert.deepStrictEqual({ status: result.status, stdout: result.stdout, stderr: result.stderr }, { status: 0, stdout: '31000000001\n', stderr: '' });
	});
});
