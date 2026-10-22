/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import type { Database } from '@vscode/sqlite3';
import { timeout } from '../../../../base/common/async.js';
import { dirname, join } from '../../../../base/common/path.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { NullLogService } from '../../../log/common/log.js';
import { ITurboFileJournalWrite, TURBOFILE_JOURNAL_DISK_BYTES, TURBOFILE_JOURNAL_RECORD_LIMIT } from '../../common/turbofileJournal.js';
import { TurboFileJournalService } from '../../node/turbofileJournalService.js';

function fixture(id: string, status: ITurboFileJournalWrite['record']['status'] = 'success'): ITurboFileJournalWrite {
	return { record: { id, kind: 'copy', status, startedAt: Date.now(), sourceDevice: 'Source', targetDevice: 'Target', sourcePath: `/source/${id}`, targetPath: `/target/${id}`, itemCount: 1 } };
}
async function openDatabase(path: string): Promise<Database> {
	await fs.mkdir(dirname(path), { recursive: true }); const sqlite = await import('@vscode/sqlite3');
	return new Promise((resolve, reject) => { const db = new sqlite.default.Database(path, error => error ? reject(error) : resolve(db)); });
}
function exec(db: Database, sql: string): Promise<void> { return new Promise((resolve, reject) => db.exec(sql, error => error ? reject(error) : resolve())); }
function run(db: Database, sql: string, params: readonly (string | number)[]): Promise<void> { return new Promise((resolve, reject) => db.run(sql, params, (error: Error | null) => error ? reject(error) : resolve())); }
function all<T>(db: Database, sql: string): Promise<T[]> { return new Promise((resolve, reject) => db.all(sql, (error: Error | null, rows: T[]) => error ? reject(error) : resolve(rows))); }
function close(db: Database): Promise<void> { return new Promise(resolve => db.close(() => resolve())); }
const legacySchema = `CREATE TABLE operations(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE NOT NULL,started INTEGER NOT NULL,status TEXT NOT NULL,kind TEXT NOT NULL,search TEXT NOT NULL,archived INTEGER NOT NULL DEFAULT 0,summary TEXT NOT NULL);
CREATE TABLE items(operation_id TEXT,source TEXT);`;

suite('TurboFile compact persistent journal', () => {
	let root: string; let store: TurboFileJournalService; let path: string;
	const createStore = (): TurboFileJournalService => new TurboFileJournalService({ userDataPath: root } as INativeEnvironmentService, new NullLogService());
	setup(async () => { root = await fs.mkdtemp(join(tmpdir(), 'turbofile-journal-test-')); path = join(root, 'turbofile-history', 'operations.sqlite'); store = createStore(); });
	teardown(async () => { await store.close(); store.dispose(); assert.ok(root.startsWith(join(tmpdir(), 'turbofile-journal-test-'))); await fs.rm(root, { recursive: true, force: true }); });

	test('persists asynchronously without a read or shutdown', async () => {
		let notifications = 0; const listener = store.onDidChange(() => notifications++);
		try { await store.append(fixture('automatic')); await timeout(800); assert.strictEqual(notifications, 1); } finally { listener.dispose(); }
	});

	test('ignores ordinary operations and persists only summary fields', async () => {
		const ordinary = fixture('ordinary'); await store.append({ record: { ...ordinary.record, kind: 'renamePath' } });
		const input = fixture('copy'); await store.append({ record: { ...input.record, bytes: 123, durationMs: 100, strategy: 'tar-direct' } });
		const page = await store.query({});
		assert.deepStrictEqual([page.records.length, page.records[0].id, page.records[0].bytes, page.records[0].strategy, page.warning], [1, 'copy', 123, 'tar-direct', undefined]);
	});

	test('survives restart and recovers unfinished operations honestly', async () => {
		await store.append(fixture('finished')); await store.append(fixture('unfinished', 'running')); await store.close(); store.dispose(); store = createStore();
		assert.deepStrictEqual((await store.query({})).records.map(record => [record.id, record.status]), [['unfinished', 'interrupted'], ['finished', 'success']]);
	});

	test('paginates 123 summaries without duplicates', async () => {
		for (let index = 0; index < 123; index++) { await store.append(fixture(`file-${index}`)); }
		const first = await store.query({}); const second = await store.query({ before: first.next }); const third = await store.query({ before: second.next });
		assert.deepStrictEqual([[first.records.length, second.records.length, third.records.length], new Set([...first.records, ...second.records, ...third.records].map(record => record.id)).size, third.next], [[50, 50, 23], 123, undefined]);
	});

	test('retains a short redacted failure reason', async () => {
		const input = fixture('failed', 'error'); await store.append({ record: { ...input.record, error: `token=secret-value ${'x'.repeat(10000)}` } });
		const record = (await store.query({})).records[0];
		assert.ok(record.error!.startsWith('token=[redacted] ') && !record.error!.includes('secret-value') && record.error!.length <= 512);
	});

	test('migrates old history, removes detail tables and compacts existing data', async () => {
		const db = await openDatabase(path); const initial = fixture('legacy');
		try {
			await exec(db, legacySchema);
			await run(db, 'INSERT INTO operations(id,started,status,kind,search,summary) VALUES(?,?,?,?,?,?)', ['legacy', initial.record.startedAt, 'success', 'copy', 'unused-search'.repeat(10000), JSON.stringify({ ...initial.record, message: 'unused-success', transitions: ['unused-trace'.repeat(10000)], recordedItems: 1, coverage: 'selected-items' })]);
			await run(db, 'INSERT INTO items VALUES(?,?)', ['legacy', 'unused-detail'.repeat(10000)]);
		} finally { await close(db); }
		const before = (await fs.stat(path)).size;
		const page = await store.query({}); await store.append(fixture('new-copy')); await store.close();
		const inspection = await openDatabase(path);
		try {
			const tables = await all<{ name: string }>(inspection, "SELECT name FROM sqlite_master WHERE type='table' AND name='items'");
			const count = await all<{ count: number }>(inspection, 'SELECT count(*) AS count FROM operations');
			assert.deepStrictEqual([page.records[0].id, JSON.stringify(page.records).includes('unused'), tables.length, count[0].count, (await fs.stat(path)).size < before], ['legacy', false, 0, 2, true]);
		} finally { await close(inspection); }
	});

	test('caps imported history at 5000 summaries and removes expired records', async () => {
		const db = await openDatabase(path);
		try {
			await exec(db, legacySchema);
			const initial = fixture('imported');
			await run(db, `WITH RECURSIVE n(value) AS (SELECT 1 UNION ALL SELECT value+1 FROM n WHERE value<${TURBOFILE_JOURNAL_RECORD_LIMIT + 3}) INSERT INTO operations(id,started,status,kind,search,summary) SELECT 'old-'||value,?,'success','copy','',json_set(?,'$.id','old-'||value) FROM n`, [initial.record.startedAt, JSON.stringify(initial.record)]);
			const old = fixture('expired'); await run(db, 'INSERT INTO operations(id,started,status,kind,search,summary) VALUES(?,?,?,?,?,?)', ['expired', Date.now() - 100 * 86400000, 'success', 'copy', '', JSON.stringify({ ...old.record, startedAt: Date.now() - 100 * 86400000 })]);
		} finally { await close(db); }
		await store.query({}); await store.close();
		const inspection = await openDatabase(path);
		try { const count = await all<{ count: number }>(inspection, 'SELECT count(*) AS count FROM operations'); assert.ok(count[0].count <= TURBOFILE_JOURNAL_RECORD_LIMIT); } finally { await close(inspection); }
	}).timeout(15000);

	test('prunes large summaries before exceeding the small disk budget', async () => {
		for (let index = 0; index < 500; index++) {
			const input = fixture(`load-${index}`); await store.append({ record: { ...input.record, sourcePath: '源'.repeat(2000), targetPath: '目'.repeat(2000) } });
			if (index % 10 === 9) { await store.flush(); }
		}
		const page = await store.query({});
		const bytes = (await Promise.all([path, `${path}-wal`, `${path}-shm`].map(file => fs.stat(file).then(stat => stat.size, () => 0)))).reduce((a, b) => a + b, 0);
		assert.ok(bytes < TURBOFILE_JOURNAL_DISK_BYTES && !page.warning && page.records[0].id === 'load-499');
	}).timeout(15000);

	test('retains a gap warning across restart', async () => {
		await store.reportGap(); await store.close(); store.dispose(); store = createStore(); assert.strictEqual((await store.query({})).warning, 'incomplete');
	});

	test('serializes concurrent reads and writes', async () => {
		await Promise.all(Array.from({ length: 100 }, async (_, index) => { await store.append(fixture(`parallel-${index}`)); await store.query({}); }));
		const first = await store.query({}); const second = await store.query({ before: first.next });
		assert.deepStrictEqual([first.records.length + second.records.length, first.warning], [100, undefined]);
	});
});
