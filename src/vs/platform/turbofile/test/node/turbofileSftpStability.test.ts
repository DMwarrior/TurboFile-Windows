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
import { localize } from '../../../../nls.js';
import { TurboFileOperationWatchdog } from '../../common/turbofileOperationWatchdog.js';

interface ITransferOptions {
	readonly step?: (totalTransferred: number, chunk: number, total: number) => void;
}

class SilentSftp extends EventEmitter {
	ended = false;
	statCalls = 0;
	statCallback: ((error: Error | undefined, stats: { size: number }) => void) | undefined;
	transferOptions: ITransferOptions | undefined;
	transferCallback: ((error: Error | undefined) => void) | undefined;

	stat(_path: string, callback: (error: Error | undefined, stats: { size: number }) => void): void {
		this.statCalls++;
		this.statCallback = callback;
	}

	close(_handle: Buffer, _callback: (error: Error | undefined) => void): void { }

	fastPut(_local: string, _remote: string, options: ITransferOptions, callback: (error: Error | undefined) => void): void {
		this.transferOptions = options;
		this.transferCallback = callback;
	}

	end(): void {
		this.ended = true;
		this.emit('close');
	}
}

interface IServiceHarness {
	remoteStat(sftp: SilentSftp, remotePath: string): Promise<{ size: number }>;
	closeRemoteFile(sftp: SilentSftp, handle: Buffer): Promise<void>;
	fastPut(sftp: SilentSftp, localPath: string, remotePath: string, options?: ITransferOptions): Promise<void>;
}

/** Replay the service's actual methods without loading Electron or registering Explorer hooks. */
function createServiceHarness(): IServiceHarness {
	const servicePath = path.join(process.cwd(), 'src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts');
	const source = ts.createSourceFile(servicePath, fs.readFileSync(servicePath, 'utf8'), ts.ScriptTarget.Latest, true);
	const names = new Set(['getSftpOperationWatchdog', 'remoteStat', 'closeRemoteFile', 'fastPut']);
	const methods: string[] = [];
	const visit = (node: ts.Node): void => {
		if (ts.isMethodDeclaration(node) && names.has(node.name.getText(source))) {
			methods.push(node.getText(source));
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
	assert.strictEqual(methods.length, names.size);
	const code = ts.transpileModule(`class Harness { sftpOperationWatchdogs = new WeakMap(); ${methods.join('\n')} }`, {
		compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
	}).outputText;
	const Harness: new () => IServiceHarness = new Function('TurboFileOperationWatchdog', 'localize', 'SFTP_REQUEST_TIMEOUT_MS', 'REMOTE_FILE_TRANSFER_INACTIVITY_TIMEOUT_MS', `${code}; return Harness;`)(TurboFileOperationWatchdog, localize, 30000, 120000);
	return new Harness();
}

suite('TurboFileSftpStability', () => {
	let clock: sinon.SinonFakeTimers;
	let sftp: SilentSftp;
	let service: IServiceHarness;

	setup(() => {
		clock = sinon.useFakeTimers();
		sftp = new SilentSftp();
		service = createServiceHarness();
	});

	teardown(() => {
		sftp.end();
		clock.restore();
	});

	test('missing stat callback closes the channel and handle cleanup cannot hang again', async () => {
		const request = assert.rejects(service.remoteStat(sftp, '/source'), /SFTP timed out/);
		await clock.tickAsync(30000);
		await request;
		await assert.rejects(service.closeRemoteFile(sftp, Buffer.from('handle')), /SFTP timed out/);
		assert.deepStrictEqual({ ended: sftp.ended, timers: clock.countTimers() }, { ended: true, timers: 0 });
	});

	test('closed connection releases a stat without waiting for a timeout', async () => {
		const request = assert.rejects(service.remoteStat(sftp, '/source'), /connection closed/);
		sftp.end();
		await request;
		assert.strictEqual(clock.countTimers(), 0);
	});

	test('file transfer reports real progress and stays alive past two minutes', async () => {
		let reportedBytes = 0;
		const transfer = service.fastPut(sftp, 'local', '/remote', { step: (_total, chunk) => reportedBytes += chunk });
		for (let step = 0; step < 5; step++) {
			await clock.tickAsync(60000);
			sftp.transferOptions?.step?.((step + 1) * 1024, 1024, 5120);
		}
		sftp.transferCallback?.(undefined);
		await transfer;
		assert.deepStrictEqual({ reportedBytes, ended: sftp.ended, timers: clock.countTimers() }, { reportedBytes: 5120, ended: false, timers: 0 });
	});

	test('zero-byte progress cannot indefinitely keep a stalled file transfer alive', async () => {
		const transfer = assert.rejects(service.fastPut(sftp, 'local', '/remote'), /without data progress/);
		await clock.tickAsync(60000);
		sftp.transferOptions?.step?.(0, 0, 1024);
		await clock.tickAsync(60000);
		await transfer;
		sftp.transferCallback?.(undefined);
		assert.deepStrictEqual({ ended: sftp.ended, timers: clock.countTimers() }, { ended: true, timers: 0 });
	});

	test('permission error leaves the channel available for another request', async () => {
		const failure = assert.rejects(service.remoteStat(sftp, '/denied'), /permission denied/);
		sftp.statCallback?.(new Error('permission denied'), { size: 0 });
		await failure;
		const success = service.remoteStat(sftp, '/allowed');
		sftp.statCallback?.(undefined, { size: 42 });
		assert.deepStrictEqual({ stats: await success, statCalls: sftp.statCalls, ended: sftp.ended, timers: clock.countTimers() }, { stats: { size: 42 }, statCalls: 2, ended: false, timers: 0 });
	});
});
