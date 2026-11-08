/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { createRequire } from 'module';
import { PassThrough } from 'stream';
import * as ts from 'typescript';
import { localize } from '../../../../nls.js';
import { classifyTurboFileTransferFailure } from '../../common/turbofileTransferFailure.js';

interface ITestProcess extends EventEmitter {
	readonly stderr: PassThrough;
}

interface IProcessHelpers {
	createLocalToolEnvironment(directory: string | undefined): NodeJS.ProcessEnv;
	waitForLocalProcessClose(child: ITestProcess, context: string): Promise<void>;
}

/** Runs the production helpers with case-sensitive environment snapshots and controlled processes. */
function loadProcessHelpers(environment: NodeJS.ProcessEnv, windows = true): IProcessHelpers {
	const file = path.join(process.cwd(), 'src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts');
	const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
	const names = new Set(['createLocalToolEnvironment', 'waitForLocalProcessClose', 'formatTransferProcessFailure', 'decodeLocalProcessOutput']);
	const declarations = source.statements.filter((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && !!node.name && names.has(node.name.text));
	assert.strictEqual(declarations.length, names.size);
	const code = ts.transpileModule(declarations.map(node => node.getText(source)).join('\n'), {
		compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true }
	}).outputText;
	return new Function('process', 'platform', 'resolveTerminalEncoding', 'localize', 'require', `${code}; return { createLocalToolEnvironment, waitForLocalProcessClose };`)(
		{ env: environment }, () => windows ? 'win32' : 'linux', async () => 'cp936', localize, createRequire(import.meta.url)
	);
}

function createProcess(): ITestProcess {
	return Object.assign(new EventEmitter(), { stderr: new PassThrough() });
}

suite('TurboFileProcessDiagnostics', () => {
	test('Windows tools preserve a mixed-case inherited Path without duplicate environment entries', () => {
		const inherited = { Path: 'C:\\Windows\\System32;C:\\Tools', USERPROFILE: 'C:\\Users\\test' };
		const environment = loadProcessHelpers(inherited).createLocalToolEnvironment('C:\\TurboFile\\tools');
		assert.deepStrictEqual({ path: environment.PATH, pathKeys: Object.keys(environment).filter(key => key.toLowerCase() === 'path'), inherited }, {
			path: 'C:\\TurboFile\\tools;C:\\Windows\\System32;C:\\Tools', pathKeys: ['PATH'], inherited: { Path: 'C:\\Windows\\System32;C:\\Tools', USERPROFILE: 'C:\\Users\\test' }
		});
	});

	test('Windows tools remove conflicting Path variants while preserving the effective PATH', () => {
		const environment = loadProcessHelpers({ PATH: 'C:\\Windows\\System32', Path: 'C:\\stale' }).createLocalToolEnvironment(undefined);
		assert.deepStrictEqual({ path: environment.PATH, pathKeys: Object.keys(environment).filter(key => key.toLowerCase() === 'path') }, { path: 'C:\\Windows\\System32', pathKeys: ['PATH'] });
	});

	test('POSIX environment names retain their case-sensitive meaning', () => {
		const environment = loadProcessHelpers({ PATH: '/usr/bin', Path: '/other' }, false).createLocalToolEnvironment('/opt/turbofile');
		assert.deepStrictEqual({ path: environment.PATH, other: environment.Path }, { path: '/opt/turbofile:/usr/bin', other: '/other' });
	});

	test('process failure retains its stage and decodes split UTF-8 and Windows lines independently', async () => {
		const iconv = (await import('@vscode/iconv-lite-umd')).default;
		const child = createProcess();
		const result = loadProcessHelpers({}).waitForLocalProcessClose(child, 'parallel tar upload extract');
		const outcome = result.catch(error => error as Error);
		const remote = Buffer.from('tar: 中文目录/file.txt: Cannot open: No such file or directory\n');
		const output = Buffer.concat([iconv.encode("'DOSKEY' 不是内部或外部命令\r\n", 'cp936'), remote]);
		for (let offset = 0; offset < output.length; offset += 3) {
			child.stderr.write(output.subarray(offset, offset + 3));
		}
		child.emit('close', 2);
		const error = await outcome;
		assert.ok(error instanceof Error);
		assert.deepStrictEqual({ message: error.message, category: classifyTurboFileTransferFailure(error).category }, {
			message: "parallel tar upload extract failed with exit code 2.\n'DOSKEY' 不是内部或外部命令\r\ntar: 中文目录/file.txt: Cannot open: No such file or directory",
			category: 'path-unavailable'
		});
	});

	test('long diagnostics preserve the first failure and trailing exit detail within a bounded message', async () => {
		const child = createProcess();
		const outcome = loadProcessHelpers({}).waitForLocalProcessClose(child, 'native tar upload create').catch(error => error as Error);
		child.stderr.write('tar: missing-source: Cannot open: No such file or directory\n');
		for (let index = 0; index < 100; index++) {
			child.stderr.write('x'.repeat(2048));
		}
		child.stderr.write('\nfinal diagnostic');
		child.emit('close', 2);
		const error = await outcome;
		assert.ok(error instanceof Error);
		assert.ok(error.message.includes('missing-source'));
		assert.ok(error.message.includes('\n[...]\n'));
		assert.ok(error.message.endsWith('final diagnostic'));
		assert.ok(error.message.length < 66 * 1024);
	});

	test('successful processes tolerate incidental stderr without becoming failed transfers', async () => {
		const child = createProcess();
		const result = loadProcessHelpers({}).waitForLocalProcessClose(child, 'native tar upload extract');
		child.stderr.write('incidental tool warning\n');
		child.emit('close', 0);
		await result;
	});

	test('spawn failures keep their executable and syscall metadata for fallback decisions', async () => {
		const child = createProcess();
		const outcome = loadProcessHelpers({}).waitForLocalProcessClose(child, 'native tar upload create').catch(error => error as Error);
		const failure = Object.assign(new Error('spawn tar.exe ENOENT'), { code: 'ENOENT', syscall: 'spawn tar.exe' });
		child.emit('error', failure);
		assert.strictEqual(await outcome, failure);
		assert.strictEqual(classifyTurboFileTransferFailure(failure).category, 'protocol-unavailable');
	});
});
