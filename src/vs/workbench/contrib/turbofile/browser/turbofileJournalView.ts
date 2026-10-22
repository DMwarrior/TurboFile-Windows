/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, addDisposableListener, EventType } from '../../../../base/browser/dom.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { ITurboFileJournalPage, ITurboFileJournalRecord, ITurboFileJournalService, TurboFileJournalStatus } from '../../../../platform/turbofile/common/turbofileJournal.js';

function kindLabel(kind: string): string {
	const labels: Record<string, string> = {
		copy: localize('journal.copy', "复制传输"), move: localize('journal.move', "剪切传输"), movePathsIntoDirectory: localize('journal.moveInto', "移动"),
		deletePath: localize('journal.delete', "永久删除"), deletePaths: localize('journal.deleteMany', "永久删除"), movePathsToTrash: localize('journal.trash', "移入回收站"),
		permanentlyDeleteTrashItems: localize('journal.deleteTrash', "永久删除"), emptyTrash: localize('journal.emptyTrash', "清空回收站")
	};
	return labels[kind] ?? kind;
}

function statusLabel(status: TurboFileJournalStatus): string {
	const labels: Record<TurboFileJournalStatus, string> = {
		running: localize('journal.running', "运行中"), success: localize('journal.success', "成功"), partial: localize('journal.partial', "部分成功"),
		error: localize('journal.error', "失败"), canceled: localize('journal.canceled', "取消"), interrupted: localize('journal.interrupted', "结果未确认")
	};
	return labels[status];
}

function sizeLabel(bytes: number): string {
	return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : bytes < 1024 * 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** A single bounded page of non-interactive summary cards. */
export class TurboFileJournalView extends Disposable {
	readonly element = $('.turbofile-full-page.turbofile-journal');
	private readonly rows = $('.turbofile-journal-results');
	private readonly notice = $('.turbofile-journal-notice');
	private readonly rowDisposables = this._register(new DisposableStore());
	private readonly reloadScheduler = this._register(new RunOnceScheduler(() => { void this.load(); }, 300));
	private before: number | undefined;
	private readonly previous: (number | undefined)[] = [];
	private generation = 0;
	private disposed = false;

	constructor(private readonly service: ITurboFileJournalService, options: { readonly compact: boolean; readonly back: () => void }) {
		super();
		if (!options.compact) {
			const header = $('.turbofile-page-header');
			const title = $('h2'); title.textContent = localize('journal.title', "任务日志");
			const back = document.createElement('button'); back.type = 'button'; back.className = 'turbofile-page-button'; back.textContent = localize('journal.back', "返回传输页");
			this._register(addDisposableListener(back, EventType.CLICK, options.back));
			header.append(title, back); this.element.append(header);
		}
		this.notice.hidden = true; this.notice.setAttribute('role', 'status');
		this.element.append(this.notice, this.rows);
		this._register(service.onDidChange(() => this.reloadScheduler.schedule()));
		void this.load();
	}

	private async load(): Promise<void> {
		if (this.disposed) { return; }
		const generation = ++this.generation;
		try {
			const page = await this.service.query({ before: this.before });
			if (!this.disposed && generation === this.generation) { this.renderPage(page); }
		} catch { if (!this.disposed && generation === this.generation) { this.notice.hidden = false; this.notice.textContent = localize('journal.loadFailed', "暂时无法读取日志。"); } }
	}

	private renderPage(page: ITurboFileJournalPage): void {
		this.rowDisposables.clear(); this.rows.replaceChildren();
		this.notice.hidden = !page.warning;
		this.notice.textContent = page.warning ? localize('journal.incomplete', "部分日志未能保存，文件操作不受影响。") : '';
		if (!page.records.length) { const empty = $('.turbofile-task-log-empty'); empty.textContent = localize('journal.empty', "暂无任务记录"); this.rows.append(empty); }
		for (const record of page.records) { this.rows.append(this.renderRecord(record)); }
		if (page.next !== undefined || this.previous.length) {
			const pager = $('.turbofile-journal-pager');
			const button = (label: string, disabled: boolean, action: () => void): HTMLButtonElement => {
				const value = document.createElement('button'); value.type = 'button'; value.className = 'turbofile-page-button'; value.textContent = label; value.disabled = disabled;
				this.rowDisposables.add(addDisposableListener(value, EventType.CLICK, action)); return value;
			};
			pager.append(button(localize('journal.previous', "上一页"), !this.previous.length, () => { this.before = this.previous.pop(); void this.load(); }), button(localize('journal.next', "下一页"), page.next === undefined, () => { if (page.next !== undefined) { this.previous.push(this.before); this.before = page.next; void this.load(); } }));
			this.rows.append(pager);
		}
	}

	private renderRecord(record: ITurboFileJournalRecord): HTMLElement {
		const card = $('article.turbofile-journal-record'); card.dataset.journalId = record.id; card.classList.add(`is-${record.status}`);
		const title = $('strong'); title.textContent = `${kindLabel(record.kind)} · ${statusLabel(record.status)}`;
		const time = document.createElement('time'); time.dateTime = new Date(record.startedAt).toISOString(); time.textContent = new Date(record.startedAt).toLocaleString();
		const path = $('span.turbofile-journal-path'); path.textContent = `${record.sourceDevice} ${record.sourcePath}${record.targetPath ? ` → ${record.targetDevice ?? record.sourceDevice} ${record.targetPath}` : ''}`;
		const metrics = $('span.turbofile-journal-metrics'); metrics.textContent = [localize('journal.items', "{0} 项", record.itemCount), record.bytes !== undefined ? sizeLabel(record.bytes) : '', record.durationMs !== undefined ? `${(record.durationMs / 1000).toFixed(1)} s` : '', record.strategy ?? ''].filter(Boolean).join(' · ');
		card.append(title, time, path, metrics);
		if (record.error) { const error = $('span.turbofile-journal-error'); error.textContent = record.error; card.append(error); }
		return card;
	}

	override dispose(): void { this.disposed = true; ++this.generation; super.dispose(); }
}
