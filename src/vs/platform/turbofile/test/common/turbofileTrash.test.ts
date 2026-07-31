/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ITurboFileTrashItem, ITurboFileTrashSource } from '../../common/turbofile.js';
import { isTurboFileSafeDeletePath, runTurboFileBatchDeleteFallback, runTurboFilePosixBatchDelete, runTurboFileSingleRemoteDelete } from '../../common/turbofileDelete.js';
import { combineTurboFileTrashOperationResults, createTurboFileKeepBothName, createTurboFileTrashFallbackResult, getTurboFileTrashDeviceIdentity, getTurboFileTrashFallbackEntries, getTurboFileTrashFallbackSources, isTurboFileProtectedTrashSource, runTurboFileTrashFallback, sortTurboFileTrashItems } from '../../common/turbofileTrash.js';

suite('TurboFileTrash', function () {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps SSH identities stable while separating users', () => {
		assert.deepStrictEqual([
			getTurboFileTrashDeviceIdentity({
				kind: 'ssh',
				connection: { host: 'NAS.local', port: 22, username: 'alice' }
			}),
			getTurboFileTrashDeviceIdentity({
				kind: 'ssh',
				connection: { host: 'nas.LOCAL', port: 22, username: 'bob' }
			})
		], [
			'ssh:nas.local:22:alice',
			'ssh:nas.local:22:bob'
		]);
	});

	test('uses a stable identity for the local Windows user', () => {
		assert.strictEqual(getTurboFileTrashDeviceIdentity({
			kind: 'local',
			localUserIdentity: 'DOMAIN\\Alice'
		}), 'local:domain\\alice');
	});

	test('creates keep-both names before the final extension', () => {
		assert.deepStrictEqual([
			createTurboFileKeepBothName('photo.jpg', 1),
			createTurboFileKeepBothName('archive.tar.gz', 2),
			createTurboFileKeepBothName('folder', 3),
			createTurboFileKeepBothName('.env', 4)
		], [
			'photo (1).jpg',
			'archive.tar (2).gz',
			'folder (3)',
			'.env (4)'
		]);
	});

	test('sorts newest deletion first without mutating the source array', () => {
		const items = [
			{ id: 'old', deletedAt: 1 },
			{ id: 'new', deletedAt: 2 },
			{ id: 'middle', deletedAt: 1.5 }
		] as ITurboFileTrashItem[];

		assert.deepStrictEqual({
			sorted: sortTurboFileTrashItems(items).map(item => item.id),
			original: items.map(item => item.id)
		}, {
			sorted: ['new', 'middle', 'old'],
			original: ['old', 'new', 'middle']
		});
	});

	test('protects filesystem roots and the recycle-bin namespace', () => {
		assert.deepStrictEqual([
			isTurboFileProtectedTrashSource('/', false),
			isTurboFileProtectedTrashSource('C:\\', true),
			isTurboFileProtectedTrashSource('D:\\data', true),
			isTurboFileProtectedTrashSource('/mnt/data/.Trash-1000/turbofile/files/a', false),
			isTurboFileProtectedTrashSource('C:\\.turbofile-trash-alice\\turbofile\\files\\a', true)
		], [
			true,
			true,
			false,
			true,
			true
		]);
	});

	test('selects only recycle-bin failures for permanent deletion fallback', () => {
		const sources: ITurboFileTrashSource[] = [
			{ endpoint: { kind: 'ssh', path: '/data/success' }, type: 'file' },
			{ endpoint: { kind: 'ssh', path: '/data/failure' }, type: 'file' },
			{ endpoint: { kind: 'ssh', path: '/data/missing' }, type: 'directory' }
		];

		assert.deepStrictEqual(
			getTurboFileTrashFallbackSources(sources, [
				{ path: '/data/success', ok: true, message: 'Moved.' },
				{ path: '/data/failure', ok: false, message: 'bash: not found' }
			]).map(source => source.endpoint.path),
			['/data/failure', '/data/missing']
		);
	});

	test('matches duplicate recycle-bin paths to sources by occurrence', () => {
		const sources: ITurboFileTrashSource[] = [
			{ endpoint: { kind: 'ssh', path: '/data/duplicate' }, type: 'file' },
			{ endpoint: { kind: 'ssh', path: '/data/duplicate' }, type: 'directory' }
		];

		assert.deepStrictEqual(
			getTurboFileTrashFallbackEntries(sources, [
				{ path: '/data/duplicate', ok: true, message: 'Moved.' },
				{ path: '/data/duplicate', ok: false, message: 'bash: not found' }
			]).map(entry => ({ type: entry.source.type, sourceIndex: entry.sourceIndex, message: entry.trashResult?.message })),
			[{ type: 'directory', sourceIndex: 1, message: 'bash: not found' }]
		);
	});

	test('preserves invalid and valid results that share the same path', () => {
		assert.deepStrictEqual(combineTurboFileTrashOperationResults(
			[{ path: '/data/same', ok: false, message: 'Source belongs to another device.' }],
			[{ path: '/data/same', ok: true, message: 'Path deleted.' }]
		), [
			{ path: '/data/same', ok: false, message: 'Source belongs to another device.' },
			{ path: '/data/same', ok: true, message: 'Path deleted.' }
		]);
	});

	test('creates localized results for successful and failed permanent-delete fallbacks', () => {
		const source: ITurboFileTrashSource = { endpoint: { kind: 'ssh', path: '/data/item' }, type: 'file' };

		assert.deepStrictEqual([
			createTurboFileTrashFallbackResult(source, { path: '/data/item', ok: false, message: 'bash: not found' }, { ok: true, message: 'Path deleted.' }),
			createTurboFileTrashFallbackResult(source, undefined, { ok: false, message: 'rm failed' }),
			createTurboFileTrashFallbackResult(source, { path: '/data/item', ok: false, message: 'bash: not found' }, { ok: false, message: 'rm failed' })
		], [
			{ path: '/data/item', ok: true, message: 'The item could not be moved to the recycle bin and was permanently deleted instead.' },
			{ path: '/data/item', ok: false, message: 'Recycle-bin move returned no result. Permanent delete fallback failed: rm failed' },
			{ path: '/data/item', ok: false, message: 'bash: not found Permanent delete fallback failed: rm failed' }
		]);
	});

	test('executes permanent-delete fallback only for failed and missing valid sources', async () => {
		const sources: ITurboFileTrashSource[] = [
			{ endpoint: { kind: 'ssh', path: '/data/success' }, type: 'file' },
			{ endpoint: { kind: 'ssh', path: '/data/failure' }, type: 'file' },
			{ endpoint: { kind: 'ssh', path: '/data/missing' }, type: 'directory' }
		];
		const deletedPaths: string[] = [];
		const executedIndexes: number[] = [];

		const result = await runTurboFileTrashFallback(
			sources,
			[
				{ path: '/data/success', ok: true, message: 'Moved.' },
				{ path: '/data/failure', ok: false, message: 'bash: not found' }
			],
			async endpoint => {
				deletedPaths.push(endpoint.path);
				return endpoint.path === '/data/failure'
					? { ok: true, message: 'Path deleted.' }
					: { ok: false, message: 'rm failed' };
			},
			async (entries, task) => {
				executedIndexes.push(...entries.map(entry => entry.sourceIndex));
				return Promise.all(entries.map(task));
			}
		);

		assert.deepStrictEqual({
			deletedPaths,
			executedIndexes,
			usedFallback: result.usedFallback,
			results: result.results
		}, {
			deletedPaths: ['/data/failure', '/data/missing'],
			executedIndexes: [1, 2],
			usedFallback: true,
			results: [
				{ path: '/data/success', ok: true, message: 'Moved.' },
				{ path: '/data/failure', ok: true, message: 'The item could not be moved to the recycle bin and was permanently deleted instead.' },
				{ path: '/data/missing', ok: false, message: 'Recycle-bin move returned no result. Permanent delete fallback failed: rm failed' }
			]
		});
	});

	test('bounds batch delete fallback and aggregates per-path failures', async () => {
		const endpoints = ['/data/one', '/data/two', '/data/three'].map(path => ({ kind: 'ssh' as const, path }));
		const calls: string[] = [];
		const releases: Array<() => void> = [];
		let active = 0;
		let maximumActive = 0;
		const resultPromise = runTurboFileBatchDeleteFallback(endpoints, 2, endpoint => new Promise(resolve => {
			calls.push(endpoint.path);
			active++;
			maximumActive = Math.max(maximumActive, active);
			releases.push(() => {
				active--;
				resolve(endpoint.path === '/data/two'
					? { ok: false, message: 'permission denied' }
					: { ok: true, message: 'Path deleted.' });
			});
		}));

		assert.deepStrictEqual({ calls: [...calls], maximumActive }, { calls: ['/data/one', '/data/two'], maximumActive: 2 });
		releases[0]();
		releases[1]();
		await Promise.resolve();
		await Promise.resolve();
		assert.deepStrictEqual(calls, ['/data/one', '/data/two', '/data/three']);
		releases[2]();

		assert.deepStrictEqual({
			result: await resultPromise,
			calls,
			maximumActive
		}, {
			result: { ok: false, message: '/data/two: permission denied' },
			calls: ['/data/one', '/data/two', '/data/three'],
			maximumActive: 2
		});
	});

	test('reports successful batch delete fallback when every path is deleted', async () => {
		const result = await runTurboFileBatchDeleteFallback(
			[
				{ kind: 'ssh', path: '/data/one' },
				{ kind: 'ssh', path: '/data/two' }
			],
			2,
			async () => ({ ok: true, message: 'Path deleted.' })
		);

		assert.deepStrictEqual(result, { ok: true, message: 'Paths deleted.' });
	});

	test('identifies filesystem roots before batch delete fallback', () => {
		assert.deepStrictEqual([
			isTurboFileSafeDeletePath('/'),
			isTurboFileSafeDeletePath('\\'),
			isTurboFileSafeDeletePath('C:\\'),
			isTurboFileSafeDeletePath('/data/item'),
			isTurboFileSafeDeletePath('C:\\data\\item')
		], [false, false, false, true, true]);
	});

	test('switches a failed POSIX batch delete to per-path deletion', async () => {
		const endpoints = [
			{ kind: 'ssh' as const, path: '/data/one' },
			{ kind: 'ssh' as const, path: '/data/two' }
		];
		const events: string[] = [];
		const result = await runTurboFilePosixBatchDelete(
			endpoints,
			2,
			async () => {
				events.push('batch');
				throw new Error('bash: not found');
			},
			async endpoint => {
				events.push(`delete:${endpoint.path}`);
				return { ok: true, message: 'Path deleted.' };
			},
			endpoint => events.push(`cache:${endpoint.path}`)
		);

		assert.deepStrictEqual({ result, events }, {
			result: { ok: true, message: 'Paths deleted.' },
			events: ['batch', 'delete:/data/one', 'delete:/data/two']
		});
	});

	test('clears every path after a successful POSIX batch delete', async () => {
		const endpoints = [
			{ kind: 'ssh' as const, path: '/data/one' },
			{ kind: 'ssh' as const, path: '/data/two' }
		];
		const events: string[] = [];
		const result = await runTurboFilePosixBatchDelete(
			endpoints,
			2,
			async () => { events.push('batch'); },
			async endpoint => {
				events.push(`delete:${endpoint.path}`);
				return { ok: true, message: 'Path deleted.' };
			},
			endpoint => events.push(`cache:${endpoint.path}`)
		);

		assert.deepStrictEqual({ result, events }, {
			result: { ok: true, message: 'Paths deleted.' },
			events: ['batch', 'cache:/data/one', 'cache:/data/two']
		});
	});

	test('rejects a POSIX batch root before any delete callback runs', async () => {
		const calls = { batch: 0, delete: 0, cache: 0 };
		const result = await runTurboFilePosixBatchDelete(
			[{ kind: 'ssh', path: '/' }, { kind: 'ssh', path: '/data/item' }],
			2,
			async () => { calls.batch++; },
			async () => {
				calls.delete++;
				return { ok: true, message: 'Path deleted.' };
			},
			() => { calls.cache++; }
		);

		assert.deepStrictEqual({ result, calls }, {
			result: { ok: false, message: 'Refusing to delete a filesystem root.' },
			calls: { batch: 0, delete: 0, cache: 0 }
		});
	});

	test('switches a failed native remote delete to SFTP and clears its cache', async () => {
		const endpoint = { kind: 'ssh' as const, path: '/data/item' };
		const events: string[] = [];
		const result = await runTurboFileSingleRemoteDelete(
			endpoint,
			async () => {
				events.push('native');
				throw new Error('rm unavailable');
			},
			async () => { events.push('sftp'); },
			() => { events.push('cache'); }
		);

		assert.deepStrictEqual({ result, events }, {
			result: { ok: true, message: 'Path deleted.' },
			events: ['native', 'sftp', 'cache']
		});
	});

	test('rejects a remote root without native SFTP or cache callbacks', async () => {
		const calls = { native: 0, sftp: 0, cache: 0 };
		const result = await runTurboFileSingleRemoteDelete(
			{ kind: 'ssh', path: '/' },
			async () => { calls.native++; },
			async () => { calls.sftp++; },
			() => { calls.cache++; }
		);

		assert.deepStrictEqual({ result, calls }, {
			result: { ok: false, message: 'Refusing to delete a filesystem root.' },
			calls: { native: 0, sftp: 0, cache: 0 }
		});
	});

	test('does not report success when native and SFTP remote deletion both fail', async () => {
		let cacheCalls = 0;
		const result = await runTurboFileSingleRemoteDelete(
			{ kind: 'ssh', path: '/data/item' },
			async () => { throw new Error('rm unavailable'); },
			async () => { throw new Error('permission denied'); },
			() => { cacheCalls++; }
		);

		assert.deepStrictEqual({ result, cacheCalls }, {
			result: { ok: false, message: 'Native delete failed: rm unavailable; SFTP delete failed: permission denied' },
			cacheCalls: 0
		});
	});
});
