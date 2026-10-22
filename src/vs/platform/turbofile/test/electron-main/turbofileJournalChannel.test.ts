/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { IServerChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { NullLogService } from '../../../log/common/log.js';
import { ITurboFileJournalService, ITurboFileJournalWrite } from '../../common/turbofileJournal.js';
import { captureTurboFileJournalOperation, TurboFileJournalChannel } from '../../electron-main/turbofileJournalChannel.js';

const endpoint = { kind: 'ssh', label: 'Server', path: '/source/a.txt', connection: { username: 'tester', host: 'host', port: 22, password: 'connection-secret', privateKey: 'private-secret' } };
function mockJournal(append: (write: ITurboFileJournalWrite) => Promise<void>): ITurboFileJournalService { return { append, reportGap: async () => { }, flush: async () => { }, onDidChange: Event.None } as ITurboFileJournalService; }

suite('TurboFile summary journal channel', () => {
	test('reschedules a terminal result arriving while the previous send is settling', async () => {
		const completion = new DeferredPromise<{ ok: boolean; message: string }>(); const statuses: string[] = [];
		const channel = new TurboFileJournalChannel({ listen: () => Event.None, call: <T>() => completion.p as Promise<T> }, mockJournal(async write => {
			statuses.push(write.record.status); if (statuses.length === 1) { queueMicrotask(() => { void completion.complete({ ok: true, message: 'done' }); }); }
		}), new NullLogService());
		try { await channel.call('', 'deletePath', [endpoint]); await timeout(250); assert.deepStrictEqual(statuses, ['running', 'success']); } finally { channel.dispose(); }
	});

	test('automatically sends without an explicit shutdown drain', async () => {
		const writes: ITurboFileJournalWrite[] = [];
		const channel = new TurboFileJournalChannel({ listen: () => Event.None, call: async <T>() => ({ ok: true, message: 'done' }) as T }, mockJournal(async write => { writes.push(write); }), new NullLogService());
		try { await channel.call('', 'deletePath', [endpoint]); await timeout(250); assert.strictEqual(writes.length, 1); } finally { channel.dispose(); }
	});

	test('records local, same-server and cross-server copies without endpoint credentials', () => {
		const local = { kind: 'local', path: 'D:/source/a.txt' };
		const sources = [local, endpoint, endpoint]; const targets = [{ ...local, path: 'D:/target/a.txt' }, { ...endpoint, path: '/target/a.txt' }, { ...endpoint, connection: { ...endpoint.connection, host: 'other-host' } }];
		const captured = sources.map((source, index) => captureTurboFileJournalOperation('transferFile', [{ source, target: targets[index] }])!);
		assert.deepStrictEqual([captured.map(write => write.record.kind), ['connection-secret', 'private-secret'].some(secret => JSON.stringify(captured).includes(secret))], [['copy', 'copy', 'copy'], false]);
	});

	test('keeps native move and batch summaries without enumerating selected files', () => {
		const move = captureTurboFileJournalOperation('renamePath', [endpoint, '/dest/a.txt'])!;
		const batch = captureTurboFileJournalOperation('transferBatch', [{ source: endpoint, targetDirectory: { ...endpoint, path: '/dest' }, items: Array.from({ length: 10000 }, () => ({ sourcePath: 'not-stored-item' })), operation: 'move' }])!;
		assert.deepStrictEqual([move.record.kind, move.record.targetPath, batch.record.itemCount, JSON.stringify(batch).includes('not-stored-item')], ['move', '/dest/a.txt', 10000, false]);
	});

	test('ignores ordinary operations, clipboard and same-directory renames', () => {
		const commands = ['renameTrashItem', 'createDirectory', 'writeFile', 'compressPath', 'extractPath', 'calculatePathSize', 'testConnection', 'installTransferDependencies', 'restoreTrashItems', 'restoreTrashPaths', 'listRemoteDirectoryNames', 'readImage', 'readImageBatch', 'writeSshTerminal', 'prepareTransferPair', 'readWindowsClipboardFiles'];
		assert.deepStrictEqual([...commands.map(command => captureTurboFileJournalOperation(command, [endpoint, 'input-secret'])), captureTurboFileJournalOperation('renamePath', [endpoint, '/source/new.txt'])], Array(commands.length + 1).fill(undefined));
	});

	test('records deletion source and item count', () => {
		const trash = captureTurboFileJournalOperation('movePathsToTrash', [{ device: endpoint, sources: [{ endpoint, type: 'file' }] }])!;
		const permanent = captureTurboFileJournalOperation('permanentlyDeleteTrashItems', [{ device: endpoint, items: [{ originalPath: endpoint.path }] }])!;
		assert.deepStrictEqual([trash.record.sourcePath, permanent.record.sourcePath, trash.record.itemCount], [endpoint.path, endpoint.path, 1]);
	});

	test('never awaits a stalled journal or changes a transfer result/cancellation token', async () => {
		const blocked = new DeferredPromise<void>(); const expected = { ok: true, message: 'done', bytes: 123, strategy: 'tar-direct' }; const request = [{ source: endpoint, target: endpoint }];
		const base: IServerChannel = { listen: () => Event.None, call: async <T>(_ctx: string, _command: string, args: unknown, token?: CancellationToken) => { assert.strictEqual(args, request); assert.strictEqual(token, CancellationToken.None); return expected as T; } };
		const channel = new TurboFileJournalChannel(base, mockJournal(() => blocked.p), new NullLogService());
		try { assert.strictEqual(await channel.call('', 'transferFile', request, CancellationToken.None), expected); const drain = channel.drain(); await blocked.complete(); await drain; } finally { channel.dispose(); }
	});

	test('does not subscribe to progress or store successful output/traces', async () => {
		const writes: ITurboFileJournalWrite[] = []; let subscriptions = 0;
		const channel = new TurboFileJournalChannel({ listen: () => { subscriptions++; return Event.None; }, call: async <T>() => ({ ok: true, bytes: 123, message: 'unused-success-output', strategy: 'tar-direct' }) as T }, mockJournal(async write => { writes.push(write); }), new NullLogService());
		try { await channel.call('', 'transferFile', [{ source: endpoint, target: endpoint, progressId: 'unused-progress-id' }]); await channel.drain(); assert.deepStrictEqual([subscriptions, writes.length, writes[0].record.bytes, JSON.stringify(writes).includes('unused')], [0, 1, 123, false]); } finally { channel.dispose(); }
	});

	test('preserves the original error and a short redacted failure summary', async () => {
		const expected = new Error('permission denied password=hunter'); const writes: ITurboFileJournalWrite[] = [];
		const channel = new TurboFileJournalChannel({ listen: () => Event.None, call: async () => { throw expected; } }, mockJournal(async write => { writes.push(write); }), new NullLogService());
		try { await assert.rejects(channel.call('', 'deletePath', [endpoint]), error => error === expected); await channel.drain(); assert.deepStrictEqual([writes[0].record.status, writes[0].record.error], ['error', 'permission denied password=[redacted]']); } finally { channel.dispose(); }
	});

	test('journal failure cannot change a successful file operation', async () => {
		const expected = { ok: true, message: 'done' };
		const channel = new TurboFileJournalChannel({ listen: () => Event.None, call: async <T>() => expected as T }, mockJournal(async () => { throw new Error('disk-full'); }), new NullLogService());
		try { assert.strictEqual(await channel.call('', 'deletePath', [endpoint]), expected); await channel.drain(); } finally { channel.dispose(); }
	});
});
