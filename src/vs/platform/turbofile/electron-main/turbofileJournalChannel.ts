/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../base/common/async.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { posix, win32 } from '../../../base/common/path.js';
import { IServerChannel } from '../../../base/parts/ipc/common/ipc.js';
import { ILogService } from '../../log/common/log.js';
import { ITurboFileJournalRecord, ITurboFileJournalService, ITurboFileJournalWrite, sanitizeTurboFileJournalText, TurboFileJournalBuffer } from '../common/turbofileJournal.js';

// Only actual transfer/delete work belongs in the audit history. Clipboard and ordinary edits do not.
const journalCommands = new Set(['transferFile', 'transferBatch', 'renamePath', 'movePathsIntoDirectory', 'deletePath', 'deletePaths', 'movePathsToTrash', 'permanentlyDeleteTrashItems', 'emptyTrash']);

// Unknown is intentional at this IPC boundary. Only explicitly selected primitive fields survive.
function object(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}
function text(value: unknown): string {
	return typeof value === 'string' ? sanitizeTurboFileJournalText(value, 2048) : '';
}
function number(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}
function device(value: unknown): string {
	const endpoint = object(value);
	const connection = object(endpoint.connection);
	const address = endpoint.kind === 'local' ? 'Windows' : `${text(connection.username)}@${text(connection.host)}:${number(connection.port) ?? 22}`;
	return text(endpoint.label) && text(endpoint.label) !== address ? `${text(endpoint.label)} (${address})` : address;
}
/** Records one renderer-to-backend operation, without instrumenting or changing any data path. */
export function captureTurboFileJournalOperation(command: string, args: readonly unknown[]): ITurboFileJournalWrite | undefined {
	if (!journalCommands.has(command)) { return undefined; }
	const request = object(args[0]);
	let source = request;
	let target: Record<string, unknown> | undefined;
	let kind = command;
	let itemCount = 1;
	if (command === 'renamePath') {
		const sourcePath = text(source.path); const targetPath = text(args[1]);
		const windows = source.kind === 'local' || /^[a-z]:[\\/]/i.test(sourcePath);
		const sourceParent = windows ? win32.dirname(sourcePath).toLowerCase() : posix.dirname(sourcePath);
		const targetParent = windows ? win32.dirname(targetPath).toLowerCase() : posix.dirname(targetPath);
		if (sourceParent === targetParent) { return undefined; }
		// The same backend primitive implements both F2 rename and native cut/paste.
		kind = 'move'; target = { ...source, path: targetPath };
	} else if (command === 'transferFile' || command === 'transferBatch') {
		source = object(request.source);
		target = object(command === 'transferBatch' ? request.targetDirectory : request.target);
		kind = request.operation === 'move' ? 'move' : 'copy';
		if (command === 'transferBatch') {
			itemCount = Array.isArray(request.items) ? request.items.length : 0;
		}
	} else if (command === 'deletePaths' || command === 'movePathsIntoDirectory') {
		const candidates = Array.isArray(args[0]) ? args[0] : [];
		itemCount = candidates.length;
		source = object(candidates[0]);
		if (command === 'movePathsIntoDirectory') {
			target = { ...source, path: text(args[1]) };
		}
	} else if (command === 'movePathsToTrash') {
		const candidates = Array.isArray(request.sources) ? request.sources : [];
		itemCount = candidates.length;
		source = { ...object(request.device), path: object(object(candidates[0]).endpoint).path };
	} else if (command === 'permanentlyDeleteTrashItems') {
		const candidates = Array.isArray(request.items) ? request.items : [];
		itemCount = candidates.length;
		source = { ...object(request.device), path: object(candidates[0]).originalPath };
	} else if (command === 'emptyTrash') {
		itemCount = 0;
	}
	const record: ITurboFileJournalRecord = {
		id: generateUuid(), kind, status: 'running', startedAt: Date.now(), sourceDevice: device(source), targetDevice: target ? device(target) : undefined,
		sourcePath: text(source.path), targetPath: target ? text(target.path) : undefined, itemCount
	};
	return { record };
}

export class TurboFileJournalChannel extends Disposable implements IServerChannel {
	private readonly pending = new TurboFileJournalBuffer();
	private sending: Promise<void> | undefined;
	private gap = false;
	private readonly scheduler = this._register(new RunOnceScheduler(() => { void this.send(); }, 100));

	constructor(private readonly channel: IServerChannel, private readonly journal: ITurboFileJournalService, private readonly logService: ILogService) { super(); }

	listen<T>(context: string, event: string, arg: unknown): Event<T> { return this.channel.listen(context, event, arg); }

	call<T>(context: string, command: string, args: unknown = [], cancellationToken?: CancellationToken): Promise<T> {
		const argumentsArray = Array.isArray(args) ? args : [];
		const captured = captureTurboFileJournalOperation(command, argumentsArray);
		if (!captured) { return this.channel.call<T>(context, command, args, cancellationToken); }
		this.enqueue(captured);
		let record = captured.record;
		return (async () => {
			try {
				const result = await this.channel.call<T>(context, command, args, cancellationToken);
				const outcome = object(result);
				const failed = number(outcome.failed);
				const completed = number(outcome.completed);
				record = { ...record, status: outcome.canceled ? 'canceled' : outcome.ok ? 'success' : completed && failed ? 'partial' : 'error', durationMs: number(outcome.durationMs) ?? Date.now() - record.startedAt,
					bytes: number(outcome.bytes), strategy: text(outcome.strategy) || undefined, error: outcome.ok || outcome.canceled ? undefined : sanitizeTurboFileJournalText(text(outcome.message), 512),
					itemCount: command === 'emptyTrash' ? (completed ?? 0) + (failed ?? 0) : record.itemCount };
				this.enqueue({ record });
				return result;
			} catch (error) {
				this.enqueue({ record: { ...record, status: 'error', durationMs: Date.now() - record.startedAt, error: sanitizeTurboFileJournalText(error instanceof Error ? error.message : String(error), 512) } });
				throw error;
			}
		})();
	}

	private enqueue(write: ITurboFileJournalWrite): void {
		this.logService.trace('[TurboFile journal] enqueue', write.record.id, write.record.status);
		this.pending.enqueue(write);
		this.gap = this.pending.takeGap() || this.gap;
		if (!this.sending && !this.scheduler.isScheduled()) { this.scheduler.schedule(); }
	}

	private send(): Promise<void> {
		if (this.sending) { return this.sending; }
		this.sending = (async () => {
			while (this.pending.size) {
				const write = this.pending.shift()!;
				try {
					if (this.gap) { this.gap = false; await this.journal.reportGap(); }
					await this.journal.append(write);
					this.logService.trace('[TurboFile journal] enqueued in shared process', write.record.id);
				} catch (error) { this.gap = true; this.logService.warn('[TurboFile journal] History is incomplete', error); }
			}
		})().finally(() => {
			this.sending = undefined;
			// An operation may finish between the last loop check and this Promise continuation.
			// Its enqueue saw `sending` and therefore did not schedule another pass.
			if (this.pending.size && !this.scheduler.isScheduled()) { this.scheduler.schedule(0); }
		});
		return this.sending;
	}

	async drain(): Promise<void> {
		this.scheduler.cancel();
		await this.send();
		await this.journal.flush();
	}
}
