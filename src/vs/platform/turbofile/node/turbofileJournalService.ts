/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { promises as fs } from 'fs';
import type { Database } from '@vscode/sqlite3';
import { RunOnceScheduler, Sequencer } from '../../../base/common/async.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { dirname, join } from '../../../base/common/path.js';
import { INativeEnvironmentService } from '../../environment/common/environment.js';
import { ILogService } from '../../log/common/log.js';
import { isTurboFileJournalKind, ITurboFileJournalPage, ITurboFileJournalQuery, ITurboFileJournalRecord, ITurboFileJournalService, ITurboFileJournalWrite, normalizeTurboFileJournalWrite, TurboFileJournalBuffer, TURBOFILE_JOURNAL_PAGE_SIZE, TURBOFILE_JOURNAL_RECORD_LIMIT } from '../common/turbofileJournal.js';

interface SummaryRow { seq: number; summary: string }

/** Stores only the small summary shown in the task card, outside the transfer process. */
export class TurboFileJournalService extends Disposable implements ITurboFileJournalService {
	declare readonly _serviceBrand: undefined;
	private readonly changed = this._register(new Emitter<void>());
	readonly onDidChange = this.changed.event;
	private readonly pending = new TurboFileJournalBuffer();
	private readonly sequence = new Sequencer();
	private database: Promise<Database> | undefined;
	private warning: string | undefined;
	private gapPending = false;
	private writesSinceCleanup = 0;
	private retryAfter = 0;
	private readonly path: string;
	private readonly flushScheduler = this._register(new RunOnceScheduler(() => { void this.flush(); }, 500));
	private readonly maintenanceScheduler = this._register(new RunOnceScheduler(() => {
		void this.sequence.queue(async () => { if (this.database) { await this.cleanup(await this.connect()); } }).catch(error => this.logService.warn('[TurboFile journal] Cleanup failed', error));
	}, 3600000));

	constructor(@INativeEnvironmentService environment: INativeEnvironmentService, @ILogService private readonly logService: ILogService) {
		super();
		this.path = join(environment.userDataPath, 'turbofile-history', 'operations.sqlite');
	}

	async append(write: ITurboFileJournalWrite): Promise<void> {
		if (!isTurboFileJournalKind(write?.record?.kind)) { return; }
		this.pending.enqueue(write);
		if (this.pending.takeGap()) { await this.reportGap(); }
		if (!this.flushScheduler.isScheduled()) { this.flushScheduler.schedule(); }
	}

	async reportGap(): Promise<void> {
		this.warning = 'incomplete'; this.gapPending = true;
		if (!this.flushScheduler.isScheduled()) { this.flushScheduler.schedule(); }
	}

	private connect(): Promise<Database> {
		return this.database ??= this.open().catch(error => { this.database = undefined; throw error; });
	}

	private async open(): Promise<Database> {
		await fs.mkdir(dirname(this.path), { recursive: true });
		const sqlite = await import('@vscode/sqlite3');
		const db = await new Promise<Database>((resolve, reject) => {
			const connection = new sqlite.default.Database(this.path, error => error ? reject(error) : resolve(connection));
		});
		try {
			db.configure('busyTimeout', 1000);
			await this.exec(db, `PRAGMA page_size=4096; PRAGMA auto_vacuum=INCREMENTAL; PRAGMA journal_mode=WAL;
				PRAGMA synchronous=NORMAL; PRAGMA cache_size=-512; PRAGMA wal_autocheckpoint=64; PRAGMA journal_size_limit=524288;
				CREATE TABLE IF NOT EXISTS operations(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE NOT NULL,started INTEGER NOT NULL,status TEXT NOT NULL,kind TEXT NOT NULL,search TEXT NOT NULL DEFAULT '',archived INTEGER NOT NULL DEFAULT 0,summary TEXT NOT NULL);
				CREATE INDEX IF NOT EXISTS operations_started ON operations(started);
				CREATE TABLE IF NOT EXISTS journal_meta(key TEXT PRIMARY KEY,value TEXT);`);
			const version = await this.all<{ user_version: number }>(db, 'PRAGMA user_version');
			if (version[0].user_version < 2) {
				// Keep existing summaries, remove old per-file detail/duplicate search text and reclaim space.
				await this.exec(db, 'DROP TABLE IF EXISTS items; DROP INDEX IF EXISTS operations_recent; DROP INDEX IF EXISTS operations_status');
				let after = 0;
				while (true) {
					const rows = await this.all<SummaryRow>(db, 'SELECT seq,summary FROM operations WHERE seq>? ORDER BY seq LIMIT 50', [after]);
					if (!rows.length) { break; }
					for (const row of rows) {
						let safe: ITurboFileJournalWrite | undefined;
						try {
							const legacy = JSON.parse(row.summary) as ITurboFileJournalRecord & { message?: string };
							safe = normalizeTurboFileJournalWrite({ record: { ...legacy, error: legacy.error ?? legacy.message } });
						} catch { this.warning = 'incomplete'; this.gapPending = true; }
						if (safe) { await this.run(db, "UPDATE operations SET search='',archived=0,summary=? WHERE seq=?", [JSON.stringify(safe.record), row.seq]); }
						else { await this.run(db, 'DELETE FROM operations WHERE seq=?', [row.seq]); }
					}
					after = rows[rows.length - 1].seq;
				}
			}
			// Recover an interrupted session in small batches, never as a fabricated success.
			while (true) {
				const unfinished = await this.all<SummaryRow>(db, "SELECT seq,summary FROM operations WHERE status='running' LIMIT 50");
				if (!unfinished.length) { break; }
				for (const row of unfinished) {
					const record: ITurboFileJournalRecord = { ...JSON.parse(row.summary), status: 'interrupted' };
					await this.run(db, "UPDATE operations SET status='interrupted',summary=? WHERE seq=?", [JSON.stringify(record), row.seq]);
				}
			}
			await this.cleanup(db, true);
			if (version[0].user_version < 2) { await this.exec(db, 'VACUUM; PRAGMA user_version=2'); }
			// 6 MiB database plus bounded WAL transactions stays within the 10 MiB disk budget.
			await this.exec(db, 'PRAGMA max_page_count=1536');
			const gap = await this.all<{ value: string }>(db, "SELECT value FROM journal_meta WHERE key='incomplete'");
			if (gap.length) { this.warning = 'incomplete'; }
			return db;
		} catch (error) { await new Promise<void>(resolve => db.close(() => resolve())); throw error; }
	}

	flush(): Promise<void> { this.flushScheduler.cancel(); return this.sequence.queue(() => this.flushPending()); }

	private async flushPending(): Promise<void> {
		if ((!this.pending.size && !this.gapPending) || Date.now() < this.retryAfter) { return; }
		const batch: ITurboFileJournalWrite[] = [];
		while (this.pending.size) { batch.push(this.pending.shift()!); }
		try {
			const db = await this.connect();
			await this.exec(db, 'BEGIN IMMEDIATE');
			try {
				for (const { record } of batch) {
					await this.run(db, "INSERT INTO operations(id,started,status,kind,search,archived,summary) VALUES(?,?,?,?,'',0,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,summary=excluded.summary", [record.id, record.startedAt, record.status, record.kind, JSON.stringify(record)]);
				}
				if (this.gapPending) { await this.run(db, "INSERT OR REPLACE INTO journal_meta VALUES('incomplete','1')"); }
				await this.exec(db, 'COMMIT'); this.gapPending = false;
			} catch (error) { await this.exec(db, 'ROLLBACK'); throw error; }
			this.writesSinceCleanup += batch.length;
			if (this.writesSinceCleanup >= 20) { await this.cleanup(db); }
		} catch (error) {
			this.warning = 'write-failed'; this.gapPending = true; this.retryAfter = Date.now() + 30000;
			this.logService.warn('[TurboFile journal] Unable to persist operation history', error);
		}
		this.changed.fire();
	}

	private async cleanup(db: Database, complete = false): Promise<void> {
		this.writesSinceCleanup = 0;
		let removed = false;
		let more = false;
		let rounds = 0;
		do {
			let rows = await this.all<{ seq: number }>(db, `SELECT seq FROM operations WHERE status!='running' AND (started<? OR seq<(SELECT seq FROM operations ORDER BY seq DESC LIMIT 1 OFFSET ${TURBOFILE_JOURNAL_RECORD_LIMIT - 1})) ORDER BY seq LIMIT 50`, [Date.now() - 90 * 86400000]);
			if (!rows.length) {
				const pages = await this.all<{ page_count: number }>(db, 'PRAGMA page_count');
				const free = await this.all<{ freelist_count: number }>(db, 'PRAGMA freelist_count');
				if ((pages[0].page_count - free[0].freelist_count) * 4096 > 4 * 1024 * 1024) { rows = await this.all<{ seq: number }>(db, "SELECT seq FROM operations WHERE status!='running' ORDER BY seq LIMIT 50"); }
			}
			more = rows.length > 0;
			for (const row of rows) { await this.run(db, 'DELETE FROM operations WHERE seq=?', [row.seq]); removed = true; }
		} while (more && (complete || ++rounds < 4));
		await this.exec(db, 'PRAGMA wal_checkpoint(TRUNCATE); PRAGMA incremental_vacuum(256)');
		this.maintenanceScheduler.schedule(more ? 1000 : 3600000);
		if (removed) { this.changed.fire(); }
	}

	query(query: ITurboFileJournalQuery): Promise<ITurboFileJournalPage> {
		return this.sequence.queue(async () => {
			await this.flushPending();
			try {
				const db = await this.connect();
				const before = Number.isFinite(query.before) ? query.before! : Number.MAX_SAFE_INTEGER;
				const rows = await this.all<SummaryRow>(db, `SELECT seq,summary FROM operations WHERE seq<? ORDER BY seq DESC LIMIT ${TURBOFILE_JOURNAL_PAGE_SIZE + 1}`, [before]);
				return { records: rows.slice(0, TURBOFILE_JOURNAL_PAGE_SIZE).map(row => JSON.parse(row.summary) as ITurboFileJournalRecord), next: rows.length > TURBOFILE_JOURNAL_PAGE_SIZE ? rows[TURBOFILE_JOURNAL_PAGE_SIZE - 1].seq : undefined, warning: this.warning };
			} catch { return { records: [], warning: 'read-failed' }; }
		});
	}

	async close(): Promise<void> {
		this.maintenanceScheduler.cancel(); await this.flush(); this.maintenanceScheduler.cancel();
		if (this.database) { const db = await this.database; await new Promise<void>(resolve => db.close(() => resolve())); this.database = undefined; }
	}

	private exec(db: Database, sql: string): Promise<void> { return new Promise((resolve, reject) => db.exec(sql, error => error ? reject(error) : resolve())); }
	private run(db: Database, sql: string, params: readonly (string | number)[] = []): Promise<void> { return new Promise((resolve, reject) => db.run(sql, params, (error: Error | null) => error ? reject(error) : resolve())); }
	private all<T>(db: Database, sql: string, params: readonly (string | number)[] = []): Promise<T[]> { return new Promise((resolve, reject) => db.all(sql, params, (error: Error | null, rows: T[]) => error ? reject(error) : resolve(rows))); }
}
