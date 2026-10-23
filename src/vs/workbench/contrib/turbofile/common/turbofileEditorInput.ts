/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import Severity from '../../../../base/common/severity.js';
import { URI } from '../../../../base/common/uri.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { ConfirmResult, IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { EditorInputCapabilities, IEditorIdentifier, IUntypedEditorInput, Verbosity } from '../../../common/editor.js';
import { EditorInput, IEditorCloseHandler } from '../../../common/editor/editorInput.js';
import { getNextTurboFileDragOperation, TurboFileDragOperation } from './turbofileDragDrop.js';

export const TURBOFILE_TAB_TITLE_MAX_LENGTH = 40;
export const TURBOFILE_TAB_COLOR_COUNT = 6;

export function isTurboFileTabTitleTooLong(title: string): boolean {
	return Array.from(title.trim()).length > TURBOFILE_TAB_TITLE_MAX_LENGTH;
}

export class TurboFileEditorInput extends EditorInput implements IEditorCloseHandler {
	static readonly ID = 'workbench.input.turbofile';
	static readonly EDITOR_ID = 'workbench.editor.turbofile';
	static readonly RESOURCE_SCHEME = 'turbofile';

	override readonly closeHandler = this;

	private readonly resourceValue: URI;
	private customTitle: string | undefined;
	private readonly dragOperations: Record<'left' | 'right', TurboFileDragOperation> = {
		left: 'copy',
		right: 'copy'
	};
	private runningTaskCount = 0;
	private cancelRunningTasksForClose: (() => Promise<void>) | undefined;
	private cleanupForClose: (() => void) | undefined;

	constructor(
		readonly instanceId: string = `transfer-${Date.now().toString(36)}`,
		readonly ordinal: number = 1,
		private readonly editorPaneId: string = TurboFileEditorInput.EDITOR_ID,
		@IDialogService private readonly dialogService: IDialogService
	) {
		super();
		this.resourceValue = URI.from({ scheme: TurboFileEditorInput.RESOURCE_SCHEME, path: `/transfer/${instanceId}` });
	}

	override get typeId(): string {
		return TurboFileEditorInput.ID;
	}

	override get editorId(): string {
		return this.editorPaneId;
	}

	override get resource(): URI {
		return this.resourceValue;
	}

	override get capabilities(): EditorInputCapabilities {
		return EditorInputCapabilities.Readonly;
	}

	override getName(): string {
		return this.customTitle ?? localize('turbofile.newTab', "新标签页");
	}

	override getTitle(_verbosity?: Verbosity): string {
		return this.getName();
	}

	override getDescription(_verbosity?: Verbosity): string {
		return '独立传输页面';
	}

	override getIcon(): ThemeIcon {
		return Codicon.remoteExplorer;
	}

	override getLabelExtraClasses(): string[] {
		return [
			'turbofile-transfer-tab',
			`turbofile-tab-color-${this.getTabColorSlot()}`
		];
	}

	getTabColorSlot(): number {
		return (this.ordinal - 1) % TURBOFILE_TAB_COLOR_COUNT;
	}

	setCustomTitle(title: string): boolean {
		const customTitle = title.trim() || undefined;
		if (customTitle && isTurboFileTabTitleTooLong(customTitle)) {
			return false;
		}
		if (this.customTitle !== customTitle) {
			this.customTitle = customTitle;
			this._onDidChangeLabel.fire();
		}
		return true;
	}

	getDragOperation(side: 'left' | 'right'): TurboFileDragOperation {
		return this.dragOperations[side];
	}

	setDragOperation(side: 'left' | 'right', operation: TurboFileDragOperation): void {
		this.dragOperations[side] = operation;
	}

	toggleDragOperation(side: 'left' | 'right'): TurboFileDragOperation {
		return this.dragOperations[side] = getNextTurboFileDragOperation(this.dragOperations[side]);
	}

	override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
		return otherInput instanceof TurboFileEditorInput && otherInput.instanceId === this.instanceId;
	}

	setRunningTaskCount(count: number): void {
		this.runningTaskCount = Math.max(0, count);
	}

	setCancelRunningTasksForClose(handler: () => Promise<void>): void {
		this.cancelRunningTasksForClose = handler;
	}

	setCleanupForClose(handler: () => void): void {
		this.cleanupForClose = handler;
	}

	override dispose(): void {
		this.cleanupForClose?.();
		this.cleanupForClose = undefined;
		this.cancelRunningTasksForClose = undefined;
		super.dispose();
	}

	showConfirm(): boolean {
		return this.runningTaskCount > 0;
	}

	async confirm(editors: ReadonlyArray<IEditorIdentifier>): Promise<ConfirmResult> {
		const inputs = editors
			.map(editor => editor.editor)
			.filter((editor): editor is TurboFileEditorInput => editor instanceof TurboFileEditorInput && editor.runningTaskCount > 0);
		const runningTaskCount = inputs.reduce((total, input) => total + input.runningTaskCount, 0);
		const { confirmed } = await this.dialogService.confirm({
			type: Severity.Warning,
			message: localize('turbofile.closeRunningTransferPage.message', '关闭此传输页？'),
			primaryButton: localize('turbofile.closeRunningTransferPage.primaryButton', '关闭并取消任务'),
			detail: inputs.length > 1
				? localize('turbofile.closeRunningTransferPages.detail', '这些传输页还有 {0} 个任务正在运行，关闭会取消这些任务。', runningTaskCount)
				: localize('turbofile.closeRunningTransferPage.detail', '此传输页还有 {0} 个任务正在运行，关闭会取消这些任务。', runningTaskCount)
		});

		if (!confirmed) {
			return ConfirmResult.CANCEL;
		}

		const cancellationResults = await Promise.allSettled(inputs.map(input => input.cancelRunningTasksForClose?.()));
		const failures: string[] = [];
		for (const [index, result] of cancellationResults.entries()) {
			if (result.status === 'fulfilled') {
				inputs[index].setRunningTaskCount(0);
			} else {
				failures.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
			}
		}
		if (failures.length) {
			await this.dialogService.error(localize('turbofile.closeCancellationFailed', "未能取消正在运行的任务，已保留传输页。可再次取消或关闭以重试。"), failures.join('\n'));
			return ConfirmResult.CANCEL;
		}
		return ConfirmResult.DONT_SAVE;
	}
}
