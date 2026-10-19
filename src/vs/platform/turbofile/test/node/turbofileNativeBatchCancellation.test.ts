/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import { ITurboFileBatchTransferItem, ITurboFileBatchTransferRequest } from '../../common/turbofile.js';
import { createPosixNativeBatchTransferPlan, createPosixPortableBatchTransferPlan } from '../../common/turbofileRemoteNativeBatchPlan.js';
import { TurboFileRemoteProcessControl } from '../../common/turbofileRemoteProcessControl.js';

interface IExecOptions {
	readonly progressId?: string;
	readonly beforeAbort?: () => Promise<void>;
	readonly onStderr?: (chunk: string) => void;
	readonly onExit?: () => void;
	readonly filterStderr?: (output: string) => string;
}

interface IHarness {
	readonly calls: { command: string; input: Uint8Array; options: IExecOptions }[];
	readonly control: TurboFileRemoteProcessControl;
	guardCalls: number;
	abortCalls: number;
	runSameRemoteNativeBatchTransfer(request: ITurboFileBatchTransferRequest, items: readonly ITurboFileBatchTransferItem[], operation: 'copy' | 'move', expectedBytes: number, startedAt: number): Promise<void>;
}

/** Exercise the real batch entry with native plans and a real ownership marker parser. */
function createHarness(portable: boolean): IHarness {
	const file = path.join(process.cwd(), 'src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts');
	const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
	let method: string | undefined;
	const visit = (node: ts.Node): void => {
		if (ts.isMethodDeclaration(node) && node.name.getText(source) === 'runSameRemoteNativeBatchTransfer') {
			method = node.getText(source);
		}
		ts.forEachChild(node, visit);
	};
	visit(source);
	assert.ok(method);
	const code = ts.transpileModule(`class Harness {
		calls = []; guardCalls = 0; abortCalls = 0; control = new TurboFileRemoteProcessControl('batch-test');
		fireTransferProgress() {} markTransferDataStarted() {} throwIfTransferCanceled() {} clearRemoteDirectoryListingCache() {}
		createBatchTransferResult() {}
		async monitorRemoteBatchNativeCopy(request, items, bytes, run) { await run(); return 0; }
		async withDirectorySshClient(endpoint, run) { return run({}); }
		async withOwnedRemoteProcess(client, id, run) {
			this.guardCalls++;
			return run(this.control, async () => { this.abortCalls++; });
		}
		async execRemoteWithInput(client, command, input, options) { this.calls.push({ command, input, options }); }
		async runRemoteMutationWithSftpFallback(endpoint, capability, id, native, fallback) { return portable ? fallback() : native(); }
		${method}
	}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
	const Harness: new () => IHarness = new Function('portable', 'TurboFileRemoteProcessControl', 'createPosixNativeBatchTransferPlan', 'createPosixPortableBatchTransferPlan', 'looksLikeWindowsPath', 'localize', 'REMOTE_DIRECTORY_TRANSFER_INACTIVITY_TIMEOUT_MS', `${code}; return Harness;`)(
		portable, TurboFileRemoteProcessControl, createPosixNativeBatchTransferPlan, createPosixPortableBatchTransferPlan, () => false, (_key: string, message: string) => message, 60_000
	);
	return new Harness();
}

const items: ITurboFileBatchTransferItem[] = [
	{ sourcePath: '/source/first.bin', targetName: 'first.bin', sourceType: 'file' },
	{ sourcePath: '/source/folder', targetName: 'folder', sourceType: 'directory' }
];
const request: ITurboFileBatchTransferRequest = {
	source: { kind: 'ssh', path: '/source' }, targetDirectory: { kind: 'ssh', path: '/target' }, items, progressId: 'batch'
};

suite('TurboFileNativeBatchCancellation', () => {
	for (const portable of [false, true]) {
		for (const operation of ['copy', 'move'] as const) {
			test(`${portable ? 'portable' : 'native'} ${operation} preserves its manifest and delegates abort to the ownership guard`, async () => {
				const service = createHarness(portable);
				await service.runSameRemoteNativeBatchTransfer(request, items, operation, 0, 0);
				const plan = (portable ? createPosixPortableBatchTransferPlan : createPosixNativeBatchTransferPlan)(items, '/target', operation);
				const call = service.calls[0];
				assert.deepStrictEqual({ count: service.calls.length, guardCalls: service.guardCalls, command: call.command, input: call.input, progressId: call.options.progressId }, {
					count: 1, guardCalls: 1, command: service.control.wrap(plan.command), input: plan.input, progressId: undefined
				});
				await call.options.beforeAbort?.();
				assert.strictEqual(service.abortCalls, 1);
				call.options.onStderr?.('TURBOFILE_PROCESS_GROUP_batch-');
				call.options.onStderr?.('test=4321:1234567890123456789\n');
				let cancelCommand = '';
				await service.control.cancel(async command => { cancelCommand = command; });
				assert.ok(cancelCommand.includes('1234567890123456789'));
				assert.strictEqual(call.options.filterStderr?.('TURBOFILE_PROCESS_GROUP_batch-test=4321:123\nPermission denied\n'), 'Permission denied\n');
			});
		}
	}

	test('batch calls without a task keep the original command without a controller', async () => {
		const service = createHarness(false);
		await service.runSameRemoteNativeBatchTransfer({ ...request, progressId: undefined }, items, 'copy', 0, 0);
		assert.deepStrictEqual({ command: service.calls[0].command, guards: service.guardCalls }, {
			command: createPosixNativeBatchTransferPlan(items, '/target', 'copy').command, guards: 0
		});
	});

	test('confirmed batch exit releases the guard without issuing a cleanup command', async () => {
		const service = createHarness(false);
		await service.runSameRemoteNativeBatchTransfer(request, items, 'copy', 0, 0);
		service.calls[0].options.onExit?.();
		await service.control.cancel(async () => { assert.fail('Completed batch should not run a kill command'); });
	});
});
