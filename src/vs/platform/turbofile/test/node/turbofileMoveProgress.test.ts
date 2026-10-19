/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawn, spawnSync } from 'child_process';
import * as ts from 'typescript';
import { buildPosixMoveProgressFunction, TurboFileMoveProgressParser } from '../../common/turbofileMoveProgress.js';
import { buildPosixHeartbeatFunction } from '../../common/turbofilePosixHeartbeat.js';

function quote(value: string): string {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

function loadBatchMoveBuilder(): (target: string, reportProgress?: boolean) => string {
	const file = path.join(process.cwd(), 'src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts');
	const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
	const builder = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'buildPosixMoveManyIntoDirectoryFromInputCommand');
	assert.ok(builder);
	const code = ts.transpileModule(builder.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
	return new Function('quotePosixShellArg', 'buildPosixHeartbeatFunction', 'buildPosixMoveProgressFunction', `${code}; return buildPosixMoveManyIntoDirectoryFromInputCommand;`)(quote, buildPosixHeartbeatFunction, buildPosixMoveProgressFunction);
}

suite('TurboFileMoveProgress', () => {
	test('reassembles exact deltas above 2 GiB across arbitrary SSH boundaries', () => {
		const deltas: number[] = [];
		const parser = new TurboFileMoveProgressParser(delta => deltas.push(delta));
		for (const chunk of ['.\nTURBOFILE_MOVE_DE', 'LTA=31000000001\r', '\nTURBOFILE_MOVE_DELTA=4096\n']) {
			parser.accept(chunk);
		}
		parser.dispose();
		assert.deepStrictEqual(deltas, [31000000001, 4096]);
	});

	test('rejects partial, unsafe and diagnostic records and ignores late output', () => {
		const deltas: number[] = [];
		const parser = new TurboFileMoveProgressParser(delta => deltas.push(delta));
		parser.accept('mv: TURBOFILE_MOVE_DELTA=100\nTURBOFILE_MOVE_DELTA=3.1e+10\nTURBOFILE_MOVE_DELTA=9007199254740992\nTURBOFILE_MOVE_DELTA=0\nTURBOFILE_MOVE_DELTA=123');
		parser.dispose();
		parser.accept('456\nTURBOFILE_MOVE_DELTA=999\n');
		assert.deepStrictEqual(deltas, []);
	});

	test('does not mistake a failed metadata move stderr volume for transferred data', () => {
		const deltas: number[] = [];
		const parser = new TurboFileMoveProgressParser(delta => deltas.push(delta));
		parser.accept('TURBOFILE_MOVE_DELTA=4096\n');
		parser.accept('mv: cannot move a file: Permission ');
		parser.accept('denied\n\nTURBOFILE_MOVE_DELTA=65536\n');
		parser.accept('TURBOFILE_MOVE_DELTA=131072\n');
		parser.dispose();
		assert.deepStrictEqual(deltas, [4096]);
	});

	test('stops observing oversized partial diagnostics instead of accepting their later counters', () => {
		const deltas: number[] = [];
		const parser = new TurboFileMoveProgressParser(delta => deltas.push(delta));
		parser.accept('x'.repeat(4097));
		parser.accept('\nTURBOFILE_MOVE_DELTA=8192\n');
		parser.dispose();
		assert.deepStrictEqual(deltas, []);
	});

	test('samples the owned mv writer without reading source trees or parent counters', () => {
		const helper = buildPosixMoveProgressFunction();
		assert.ok(helper.includes('"/proc/$tf_move_pid/io"'));
		assert.ok(helper.includes('$1 == "wchar:"'));
		assert.ok(helper.includes('printf "%.0f\\n", $2 + 0'));
		assert.ok(!helper.includes('rchar:') && !helper.includes('/children') && !helper.includes('du ') && !helper.includes('find '));
	});

	test('retains batch size, no-overwrite and foreground NUL input routing', () => {
		const builder = loadBatchMoveBuilder();
		const command = builder('/target path', true);
		assert.ok(command.includes('xargs -0 -r -n 128 bash -c'));
		assert.ok(command.includes('tf_run_move mv -n -- "$@" "$0"'));
		assert.ok(command.includes('run_with_heartbeat mv -n -- "$@" "$0"'));
		assert.ok(!command.includes('mv -f') && !command.includes('xargs -P'));
		assert.ok(!builder('/target path').includes('tf_run_move'));
	});

	test('metadata moves produce no byte rate and do not wait for observer sleep', function () {
		if (process.platform !== 'linux') {
			this.skip();
		}
		this.timeout(6000);
		const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'turbofile-move-progress-'));
		try {
			const source = path.join(directory, 'source');
			const target = path.join(directory, 'target');
			fs.writeFileSync(source, 'metadata move');
			// A five-second interval makes accidental completion waits observable without a tight CI timing limit.
			const helper = buildPosixMoveProgressFunction().replace('sleep 0.5 ', 'sleep 5 ');
			const started = Date.now();
			const result = spawnSync('sh', ['-c', `${helper}; tf_run_move mv -f ${quote(source)} ${quote(target)}`], { encoding: 'utf8', timeout: 4000 });
			assert.strictEqual(result.status, 0, result.stderr);
			assert.ok(Date.now() - started < 3000, 'Completion waited for the sampling interval.');
			assert.ok(!result.stderr.includes('TURBOFILE_MOVE_DELTA='), result.stderr);
			assert.strictEqual(fs.readFileSync(target, 'utf8'), 'metadata move');
			assert.ok(!fs.existsSync(source));
		} finally {
			fs.rmSync(directory, { recursive: true, force: true });
		}
	});

	test('observes real write bytes and cancellation stops the owned writer promptly', async function () {
		if (process.platform !== 'linux') {
			this.skip();
		}
		this.timeout(8000);
		const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'turbofile-move-cancel-'));
		const output = path.join(directory, 'output');
		const writer = `const fs = require('fs'); const fd = fs.openSync(${JSON.stringify(output)}, 'w'); process.stdout.write(String(process.pid) + '\\n'); setInterval(() => fs.writeSync(fd, Buffer.alloc(65536)), 20);`;
		const command = `${buildPosixMoveProgressFunction()}; tf_run_move ${quote(process.execPath)} -e ${quote(writer)}`;
		const child = spawn('sh', ['-c', command], { stdio: ['ignore', 'pipe', 'pipe'] });
		let writerPid = 0;
		let outputText = '';
		child.stdout.on('data', chunk => { outputText += chunk.toString(); writerPid = Number(outputText.trim()); });
		let timeout: ReturnType<typeof setTimeout> | undefined;
		try {
			const ended = new Promise<number | null>((resolve, reject) => { child.once('exit', resolve); child.once('error', reject); });
			await new Promise<void>((resolve, reject) => {
				timeout = setTimeout(() => reject(new Error('No write sample arrived.')), 4000);
				const parser = new TurboFileMoveProgressParser(delta => {
					if (delta >= 65536) {
						parser.dispose();
						clearTimeout(timeout);
						resolve();
					}
				});
				child.stderr.on('data', chunk => parser.accept(chunk.toString()));
			});
			assert.ok(writerPid > 0);
			child.kill('SIGHUP');
			assert.strictEqual(await ended, 143);
			await new Promise(resolve => setTimeout(resolve, 100));
			const stat = `/proc/${writerPid}/stat`;
			assert.ok(!fs.existsSync(stat) || fs.readFileSync(stat, 'utf8').split(') ')[1].startsWith('Z '), 'Owned writer survived cancellation.');
		} finally {
			clearTimeout(timeout);
			child.kill('SIGKILL');
			if (writerPid > 0) {
				try { process.kill(writerPid, 'SIGKILL'); } catch { /* Already exited. */ }
			}
			fs.rmSync(directory, { recursive: true, force: true });
		}
	});
});
