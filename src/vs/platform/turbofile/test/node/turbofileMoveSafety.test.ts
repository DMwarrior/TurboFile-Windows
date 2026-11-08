/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { execFile } from 'child_process';
import { buildTurboFilePosixMoveCaptureCommand, buildTurboFilePosixMoveCleanupCommand, captureTurboFileLocalMoveSnapshots, captureTurboFileRemoteMoveSnapshots, decodeTurboFileRemoteMoveSnapshots, encodeTurboFileMoveCapturePaths, encodeTurboFileMoveCleanupSnapshot, ITurboFileMoveRemoteStats } from '../../node/turbofileMoveSafety.js';

function remoteStats(kind: 'file' | 'directory' | 'link', size = 0, mtime = 10): ITurboFileMoveRemoteStats {
	return { size, mtime, isFile: () => kind === 'file', isDirectory: () => kind === 'directory', isSymbolicLink: () => kind === 'link' };
}

/** Execute the exact embedded Python program locally, without a shell or an SSH server. */
function runPython(python: string, command: string, input: Buffer): Promise<string> {
	const encoded = command.match(/[A-Za-z0-9+/]{128,}={0,2}/)?.[0];
	assert.ok(encoded, 'Command must contain its encoded Python program.');
	return new Promise((resolve, reject) => {
		const child = execFile(python, ['-c', Buffer.from(encoded, 'base64').toString('utf8')], { windowsHide: true, timeout: 10000 }, (error, stdout, stderr) => error ? reject(new Error(stderr || error.message)) : resolve(stdout));
		child.stdin!.on('error', () => {});
		child.stdin!.end(input);
	});
}

suite('TurboFileMoveSafety', () => {
	let root: string;
	let python: string | undefined;

	suiteSetup(async () => {
		for (const candidate of ['python3', 'python']) {
			const available = await new Promise<boolean>(resolve => execFile(candidate, ['-c', 'import sys; sys.exit(0 if sys.version_info >= (3, 6) else 1)'], { windowsHide: true, timeout: 5000 }, error => resolve(!error)));
			if (available) {
				python = candidate;
				break;
			}
		}
	});

	setup(async () => {
		root = await fs.mkdtemp(path.join(os.tmpdir(), 'turbofile-move-safety-'));
	});

	teardown(async () => {
		assert.ok(path.basename(root).startsWith('turbofile-move-safety-'));
		await fs.rm(root, { recursive: true, force: true });
	});

	test('captures file identity and empty directories without including files created later', async () => {
		await fs.mkdir(path.join(root, 'empty'));
		await fs.writeFile(path.join(root, 'old.txt'), 'before');
		const snapshot = (await captureTurboFileLocalMoveSnapshots([root], () => {})).get(root)!;
		await fs.writeFile(path.join(root, 'new.txt'), 'new');
		assert.deepStrictEqual({
			files: snapshot.files.map(file => ({ name: path.basename(file.path), size: file.size, identity: file.ctime !== undefined && file.ino !== undefined && file.dev !== undefined })),
			directories: [...snapshot.directories].map(directory => path.relative(root, directory)).sort(),
			retained: snapshot.retained,
		}, { files: [{ name: 'old.txt', size: 6, identity: true }], directories: ['', 'empty'], retained: false });
	});

	test('propagates a canceled or unreadable scan instead of returning a partial deletion list', async () => {
		const canceled = new Error('cancel-source-snapshot');
		await assert.rejects(captureTurboFileLocalMoveSnapshots([root], () => { throw canceled; }), error => error === canceled);
		await assert.rejects(captureTurboFileLocalMoveSnapshots([path.join(root, 'missing')], () => {}), /ENOENT/);
	});

	test('a selected directory link never makes its target eligible for deletion', async () => {
		const target = path.join(root, 'target'), link = path.join(root, 'link');
		await fs.mkdir(target);
		await fs.writeFile(path.join(target, 'keep.txt'), 'unrelated');
		await fs.symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir');
		const snapshot = (await captureTurboFileLocalMoveSnapshots([link], () => {})).get(link)!;
		assert.deepStrictEqual({ files: snapshot.files, directories: [...snapshot.directories], retained: snapshot.retained, original: await fs.readFile(path.join(target, 'keep.txt'), 'utf8') }, {
			files: [], directories: [], retained: true, original: 'unrelated',
		});
	});

	test('remote fallback reuses file attributes and retains links without traversing them', async () => {
		const statCalls: string[] = [], readCalls: string[] = [];
		const snapshots = await captureTurboFileRemoteMoveSnapshots(['/root'], {
			stat: async remotePath => { statCalls.push(remotePath); return remoteStats('directory'); },
			readDirectory: async remotePath => {
				readCalls.push(remotePath);
				return remotePath === '/root' ? [
					{ filename: 'a.txt', attrs: remoteStats('file', 8) },
					{ filename: 'dir', attrs: remoteStats('directory') },
					{ filename: 'link', attrs: remoteStats('link') },
				] : [];
			}
		}, () => {});
		const snapshot = snapshots.get('/root')!;
		assert.deepStrictEqual({ statCalls, readCalls, files: snapshot.files, directories: [...snapshot.directories], retained: snapshot.retained }, {
			statCalls: ['/root', '/root/dir'], readCalls: ['/root', '/root/dir'], files: [{ path: '/root/a.txt', size: 8, mtime: 10 }], directories: ['/root', '/root/dir'], retained: true,
		});
	});

	test('refuses incomplete or escaping remote metadata before cleanup is possible', () => {
		assert.throws(() => decodeTurboFileRemoteMoveSnapshots(['/root'], '{"snapshots":[]}'), /Incomplete/);
		assert.throws(() => decodeTurboFileRemoteMoveSnapshots(['/root'], JSON.stringify({ snapshots: [{ sourceKind: 'ssh', rootPath: '/root', files: [{ path: '/root/../other/file', size: 1, mtime: 1 }], directories: [] }] })), /invalid paths/);
	});

	test('Python cleanup preserves new and changed files and removes only unchanged transferred files', async function () {
		if (!python) { this.skip(); }
		const remoteRoot = root.replace(/\\/g, '/');
		await fs.writeFile(path.join(root, 'unchanged.txt'), 'safe');
		await fs.writeFile(path.join(root, 'changed.txt'), 'old!');
		const output = await runPython(python, buildTurboFilePosixMoveCaptureCommand(), encodeTurboFileMoveCapturePaths([remoteRoot]));
		const snapshot = decodeTurboFileRemoteMoveSnapshots([remoteRoot], output).get(remoteRoot)!;
		const prior = await fs.stat(path.join(root, 'changed.txt'));
		await fs.writeFile(path.join(root, 'changed.txt'), 'new!');
		await fs.utimes(path.join(root, 'changed.txt'), prior.atime, prior.mtime);
		await fs.writeFile(path.join(root, 'added.txt'), 'new file');
		const cleanup = JSON.parse(await runPython(python, buildTurboFilePosixMoveCleanupCommand(), encodeTurboFileMoveCleanupSnapshot(snapshot)));
		assert.deepStrictEqual({ cleanup, remaining: (await fs.readdir(root)).sort(), changed: await fs.readFile(path.join(root, 'changed.txt'), 'utf8') }, {
			cleanup: { retained: true, deletedFiles: 1 }, remaining: ['added.txt', 'changed.txt'], changed: 'new!',
		});
	});

	test('Python cleanup refuses a replaced parent directory and leaves its new contents intact', async function () {
		if (!python) { this.skip(); }
		const remoteRoot = root.replace(/\\/g, '/');
		const nested = path.join(root, 'nested');
		await fs.mkdir(nested);
		await fs.writeFile(path.join(nested, 'a.txt'), 'before');
		const output = await runPython(python, buildTurboFilePosixMoveCaptureCommand(), encodeTurboFileMoveCapturePaths([remoteRoot]));
		const snapshot = decodeTurboFileRemoteMoveSnapshots([remoteRoot], output).get(remoteRoot)!;
		await fs.rename(nested, path.join(root, 'saved'));
		await fs.mkdir(nested);
		await fs.writeFile(path.join(nested, 'a.txt'), 'after!');
		const cleanup = JSON.parse(await runPython(python, buildTurboFilePosixMoveCleanupCommand(), encodeTurboFileMoveCleanupSnapshot(snapshot)));
		assert.deepStrictEqual({ cleanup, old: await fs.readFile(path.join(root, 'saved/a.txt'), 'utf8'), replacement: await fs.readFile(path.join(nested, 'a.txt'), 'utf8') }, {
			cleanup: { retained: true, deletedFiles: 0 }, old: 'before', replacement: 'after!',
		});
	});

	test('Python cleanup removes empty captured directories without recursively deleting additions', async function () {
		if (!python) { this.skip(); }
		const source = path.join(root, 'source');
		await fs.mkdir(path.join(source, 'empty'), { recursive: true });
		await fs.writeFile(path.join(source, 'data.txt'), 'copied');
		const remoteRoot = source.replace(/\\/g, '/');
		const snapshot = decodeTurboFileRemoteMoveSnapshots([remoteRoot], await runPython(python, buildTurboFilePosixMoveCaptureCommand(), encodeTurboFileMoveCapturePaths([remoteRoot]))).get(remoteRoot)!;
		const cleanup = JSON.parse(await runPython(python, buildTurboFilePosixMoveCleanupCommand(), encodeTurboFileMoveCleanupSnapshot(snapshot)));
		assert.deepStrictEqual({ cleanup, remaining: await fs.readdir(root) }, { cleanup: { retained: false, deletedFiles: 1 }, remaining: [] });
	});
});
