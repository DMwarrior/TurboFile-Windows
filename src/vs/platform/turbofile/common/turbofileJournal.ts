/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const ITurboFileJournalService = createDecorator<ITurboFileJournalService>('turboFileJournalService');
export const TURBOFILE_JOURNAL_CHANNEL = 'turbofile:journal';
export const TURBOFILE_JOURNAL_PAGE_SIZE = 50;
export const TURBOFILE_JOURNAL_QUEUE_BYTES = 256 * 1024;
export const TURBOFILE_JOURNAL_DISK_BYTES = 10 * 1024 * 1024;
export const TURBOFILE_JOURNAL_RECORD_BYTES = 32 * 1024;
export const TURBOFILE_JOURNAL_RECORD_LIMIT = 5000;
const journalKinds = new Set(['copy', 'move', 'movePathsIntoDirectory', 'deletePath', 'deletePaths', 'movePathsToTrash', 'permanentlyDeleteTrashItems', 'emptyTrash']);
const journalStatuses = new Set(['running', 'success', 'partial', 'error', 'canceled', 'interrupted']);

export function isTurboFileJournalKind(kind: string): boolean { return journalKinds.has(kind); }
export type TurboFileJournalStatus = 'running' | 'success' | 'partial' | 'error' | 'canceled' | 'interrupted';

/** Only the summary card is persisted: no item lists, progress samples or successful command output. */
export interface ITurboFileJournalRecord {
	readonly id: string;
	readonly kind: string;
	readonly status: TurboFileJournalStatus;
	readonly startedAt: number;
	readonly sourceDevice: string;
	readonly targetDevice?: string;
	readonly sourcePath: string;
	readonly targetPath?: string;
	readonly itemCount: number;
	readonly bytes?: number;
	readonly durationMs?: number;
	readonly strategy?: string;
	readonly error?: string;
}

export interface ITurboFileJournalWrite { readonly record: ITurboFileJournalRecord }
export interface ITurboFileJournalQuery { readonly before?: number }
export interface ITurboFileJournalPage {
	readonly records: readonly ITurboFileJournalRecord[];
	readonly next?: number;
	readonly warning?: string;
}

export interface ITurboFileJournalService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	append(write: ITurboFileJournalWrite): Promise<void>;
	query(query: ITurboFileJournalQuery): Promise<ITurboFileJournalPage>;
	flush(): Promise<void>;
	reportGap(): Promise<void>;
}

/** Keep error text short and remove credential forms before either journal IPC boundary. */
export function sanitizeTurboFileJournalText(text: string, maxLength = 2048): string {
	return text.slice(0, maxLength).replace(/((?:password|passphrase|token|authorization|secret)\s*["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|\S+)/gi, '$1[redacted]')
		.replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [redacted]')
		.replace(/\b([a-z][a-z0-9+.-]{0,16}:\/\/[^\s/:@]+:)[^\s@]+@/gi, '$1[redacted]@')
		.replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*/g, '[private key redacted]');
}

/** Explicit copying also removes unused detail fields when upgrading an older history database. */
export function normalizeTurboFileJournalWrite(write: ITurboFileJournalWrite): ITurboFileJournalWrite | undefined {
	const value = write?.record;
	if (!value || !isTurboFileJournalKind(value.kind) || typeof value.id !== 'string' || !/^[\w-]{1,80}$/.test(value.id) || !Number.isFinite(value.startedAt) || value.startedAt < 0 || value.startedAt > 8640000000000000 || !journalStatuses.has(value.status)) { return undefined; }
	const text = (value: string | undefined, limit = 2048): string | undefined => typeof value === 'string' ? sanitizeTurboFileJournalText(value, limit) : undefined;
	const number = (value: number | undefined): number | undefined => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
	return { record: {
		id: value.id, kind: value.kind, status: value.status, startedAt: value.startedAt,
		sourceDevice: text(value.sourceDevice, 256) ?? '', targetDevice: text(value.targetDevice, 256), sourcePath: text(value.sourcePath) ?? '', targetPath: text(value.targetPath),
		itemCount: Math.floor(number(value.itemCount) ?? 0), bytes: number(value.bytes), durationMs: number(value.durationMs), strategy: text(value.strategy, 80),
		error: value.status === 'error' || value.status === 'partial' ? text(value.error, 512) : undefined
	} };
}

/** Coalesce the start/result of each task, with a fixed memory budget and final-summary priority. */
export class TurboFileJournalBuffer {
	private readonly entries = new Map<string, { write: ITurboFileJournalWrite; bytes: number }>();
	private retainedBytes = 0;
	private gap = false;
	get size(): number { return this.entries.size; }
	get byteLength(): number { return this.retainedBytes; }
	takeGap(): boolean { const gap = this.gap; this.gap = false; return gap; }

	enqueue(input: ITurboFileJournalWrite): void {
		const write = normalizeTurboFileJournalWrite(input);
		if (!write) { this.gap = true; return; }
		const bytes = VSBuffer.fromString(JSON.stringify(write)).byteLength;
		if (bytes > TURBOFILE_JOURNAL_RECORD_BYTES) { this.gap = true; return; }
		const previous = this.entries.get(write.record.id);
		while (this.retainedBytes - (previous?.bytes ?? 0) + bytes > TURBOFILE_JOURNAL_QUEUE_BYTES) {
			this.gap = true;
			let victim: string | undefined;
			for (const [id, entry] of this.entries) { if (id !== write.record.id && entry.write.record.status === 'running') { victim = id; break; } }
			if (victim === undefined) { return; }
			this.retainedBytes -= this.entries.get(victim)!.bytes; this.entries.delete(victim);
		}
		this.entries.set(write.record.id, { write, bytes }); this.retainedBytes += bytes - (previous?.bytes ?? 0);
	}

	shift(): ITurboFileJournalWrite | undefined {
		const first = this.entries.entries().next().value;
		if (!first) { return undefined; }
		this.entries.delete(first[0]); this.retainedBytes -= first[1].bytes; return first[1].write;
	}
}
