/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { getNextTurboFileDragOperation, getTurboFileDirectoryMoveRefreshPaths, getTurboFileDropEffect, getTurboFileRowDragEffectAllowed, resolveTurboFileDragOperation, shouldHandleTurboFilePaneDropAtPage } from '../../common/turbofileDragDrop.js';

function readTurboFileEditor(): string {
	return fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');
}

function methodBlock(source: string, start: string, end: string): string {
	const startIndex = source.indexOf(start);
	const endIndex = source.indexOf(end, startIndex);
	assert.ok(startIndex >= 0, `Missing start marker: ${start}`);
	assert.ok(endIndex > startIndex, `Missing end marker after ${start}: ${end}`);
	return source.slice(startIndex, endIndex);
}

suite('TurboFileDragDrop', () => {
	test('permits a same-pane move even when pane-to-pane drags copy', () => {
		const editor = readTurboFileEditor();
		const beginDragStart = editor.indexOf('private beginFileRowDrag');
		const beginDragEnd = editor.indexOf('private renderTransferPage', beginDragStart);
		const beginDrag = editor.slice(beginDragStart, beginDragEnd);

		assert.ok(beginDrag.includes('getTurboFileRowDragEffectAllowed()'));
		assert.ok(!beginDrag.includes('event.dataTransfer.effectAllowed = getTurboFileDropEffect(operation)'));
	});

	test('lets folder rows handle same-pane moves while the page handles copies and external drops', () => {
		assert.deepStrictEqual([
			getTurboFileRowDragEffectAllowed(),
			shouldHandleTurboFilePaneDropAtPage('left', 'left'),
			shouldHandleTurboFilePaneDropAtPage('left', 'right'),
			shouldHandleTurboFilePaneDropAtPage(undefined, 'right')
		], [
			'copyMove',
			false,
			true,
			true
		]);
	});

	test('resolves drag operation and drop effect safely', () => {
		assert.deepStrictEqual([
			resolveTurboFileDragOperation('move', 'copy'),
			resolveTurboFileDragOperation('invalid', 'copy'),
			getNextTurboFileDragOperation('copy'),
			getTurboFileDropEffect('move')
		], ['move', 'copy', 'move', 'move']);
	});

	test('renders side-colored mode buttons and routes drag snapshots', () => {
		const editor = readTurboFileEditor();
		const css = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/media/turbofile.css'), 'utf8');

		assert.deepStrictEqual({
			button: editor.includes('this.appendDragOperationButton(toolbar, side)'),
			snapshot: editor.includes("setData('application/x-turbofile-operation', operation)"),
			internalDrop: editor.includes("this.recordNativeInternalDrop({ kind: 'pane'"),
			externalDrop: editor.includes('this.transferExternalPaths(targetSide, externalPaths, operation, initiatedAt)'),
			leftBlue: css.includes('.turbofile-pane[data-turbofile-side="left"] .turbofile-drag-operation-button.is-copy'),
			rightGreen: css.includes('.turbofile-pane[data-turbofile-side="right"] .turbofile-drag-operation-button.is-copy'),
			cutRed: css.includes('.turbofile-drag-operation-button.is-move') && css.includes('color: #ef6670;'),
			compactLabel: editor.includes("$('span.turbofile-drag-operation-icon', undefined, label)"),
			noSelectedHighlight: css.includes('.turbofile-drag-operation-button:focus') && css.includes('background: transparent;'),
			largerThinLabel: /\.turbofile-drag-operation-icon\s*\{[\s\S]*?font-size:\s*10px;[\s\S]*?font-weight:\s*400;/.test(css)
		}, {
			button: true,
			snapshot: true,
			internalDrop: true,
			externalDrop: true,
			leftBlue: true,
			rightGreen: true,
			cutRed: true,
			compactLabel: true,
			noSelectedHighlight: true,
			largerThinLabel: true
		});
	});

	test('passes the snapshotted mode through pane-to-Windows drags', () => {
		const contract = fs.readFileSync(path.join(process.cwd(), 'src/vs/platform/turbofile/common/turbofile.ts'), 'utf8');
		const editor = readTurboFileEditor();
		const requestStart = contract.indexOf('export interface ITurboFileStartWindowsDragRequest');
		const requestBlock = contract.slice(requestStart, contract.indexOf('export interface ITurboFileImageMetadataEntry', requestStart));

		assert.deepStrictEqual({
			requestOperation: requestBlock.includes("readonly operation?: 'copy' | 'move';"),
			requestSession: requestBlock.includes('readonly sessionId: string;'),
			snapshottedField: editor.includes('private nativeDragSession: TurboFileNativeDragSession<TurboFileFileItem> | undefined;'),
			passesOperation: editor.includes('operation: session.operation'),
			moveUsesBatch: editor.includes("if (operation === 'copy' && items.length === 1)"),
			batchReceivesOperation: editor.includes('\n\t\t\t\toperation,\n\t\t\t\tprogressId,')
		}, {
			requestOperation: true,
			requestSession: true,
			snapshottedField: true,
			passesOperation: true,
			moveUsesBatch: true,
			batchReceivesOperation: true
		});
	});

	test('refreshes both source and target directories after a same-pane folder move', () => {
		assert.deepStrictEqual(getTurboFileDirectoryMoveRefreshPaths('/work/images', '/work/images/done'), [
			'/work/images',
			'/work/images/done'
		]);
	});

	test('keeps local file drops inside TurboFile panes instead of bubbling to the workbench opener', () => {
		const editor = readTurboFileEditor();

		assert.ok(editor.includes('private consumeTurboFileDropEvent(event: DragEvent): void'));
		assert.ok(editor.includes('this.consumeTurboFileDropEvent(event);'));
	});

	test('keeps internal drops in Chromium and hands the frozen session to Windows only after leaving the window', () => {
		const editor = readTurboFileEditor();
		const beginSession = methodBlock(editor, 'private beginFileDragSession', 'private handoffFileDragSessionToWindows');
		const handoff = methodBlock(editor, 'private handoffFileDragSessionToWindows', 'private async runNativeFileDrag');

		assert.deepStrictEqual({
			keepsChromiumDrag: !beginSession.includes('event.preventDefault();') && !beginSession.includes('runNativeFileDrag'),
			fileRowsReuseEntry: editor.includes('this.beginFileDragSession(side, event);'),
			imageGridReusesEntry: editor.includes('this.beginFileDragSession(state.side, event);'),
			pageExitHandsOff: editor.includes('private handleTransferPageDragLeave') && editor.includes('this.handoffFileDragSessionToWindows();'),
			pointerExitFallback: editor.includes('private maybeHandoffFileDragSessionToWindows'),
			handoffClearsBeforeNativeStart: handoff.indexOf('this.clearCurrentFileDragState();') < handoff.indexOf('void this.runNativeFileDrag(session);'),
			noRenderDuringHandoff: !handoff.includes('this.render()')
		}, {
			keepsChromiumDrag: true,
			fileRowsReuseEntry: true,
			imageGridReusesEntry: true,
			pageExitHandsOff: true,
			pointerExitFallback: true,
			handoffClearsBeforeNativeStart: true,
			noRenderDuringHandoff: true
		});
	});

	test('records internal native drops before executing frozen selections', () => {
		const editor = readTurboFileEditor();
		const recordDrop = methodBlock(editor, 'private recordNativeInternalDrop', 'private executeNativeInternalDrop');
		const executeDrop = methodBlock(editor, 'private executeNativeInternalDrop', 'private beginFileDragSession');

		assert.deepStrictEqual({
			recordsImmutableTarget: recordDrop.includes('dropTurboFileNativeDragSessionInternally(session, target)'),
			settlesBeforeExecuting: recordDrop.includes("settleTurboFileNativeDragSession(dropped, 'completed')") && recordDrop.includes('this.deferAfterDrag(() => this.executeNativeInternalDrop(completed));'),
			frozenPaneItems: executeDrop.includes('session.items'),
			frozenTransferOverride: editor.includes('sourceItemsOverride: readonly TurboFileFileItem[] | undefined = undefined'),
			frozenDirectoryOverride: editor.includes('sourceItemsOverride: readonly TurboFileFileItem[] | undefined = undefined')
		}, {
			recordsImmutableTarget: true,
			settlesBeforeExecuting: true,
			frozenPaneItems: true,
			frozenTransferOverride: true,
			frozenDirectoryOverride: true
		});
	});

	test('normalizes external Windows paths before transferring them', () => {
		const editor = readTurboFileEditor();

		assert.ok(editor.includes('await this.sshService.normalizeLocalWindowsPaths(sourcePaths)'));
		assert.ok(editor.includes('await this.resolveExternalTransferItems(normalizedSourcePaths)'));
		assert.ok(editor.includes('const groupsByParent = new Map<string, ExternalPathParentGroup>();'));
		assert.ok(editor.includes('Math.min(EXTERNAL_PATH_PARENT_LIST_CONCURRENCY, groups.length)'));
	});

	test('starts folder and multi-item transfers without renderer size discovery', () => {
		const editor = readTurboFileEditor();
		const batchStart = editor.indexOf('private async transferItemsBatch');
		const batchEnd = editor.indexOf('private insertOptimisticPaneItem', batchStart);
		const batch = editor.slice(batchStart, batchEnd);

		assert.ok(batchStart >= 0);
		assert.ok(!batch.includes('fillBatchDirectorySizesInBackground'));
		assert.ok(!batch.includes('calculatePathSize'));
		assert.ok(batch.includes('task.trackTotalBytes ? Math.max(0, item.rawSize) : 0'));
	});

	test('deletes cut sources before refreshing source and target panes', () => {
		const editor = readTurboFileEditor();
		const start = editor.indexOf('private async pasteInternalTransferClipboard');
		const block = editor.slice(start, editor.indexOf('private isSameTransferTarget', start));
		const deleteIndex = block.indexOf('await this.deleteInternalClipboardSources');
		const refreshIndex = block.lastIndexOf('await this.refreshTransferPanes');

		assert.ok(deleteIndex >= 0);
		assert.ok(refreshIndex > deleteIndex);
	});

	test('refreshes external cut source and target only after source cleanup', () => {
		const editor = readTurboFileEditor();
		const start = editor.indexOf('private async transferExternalPaths');
		const block = editor.slice(start, editor.indexOf('private async pasteWindowsClipboardFiles', start));
		const deleteIndex = block.indexOf('await this.deleteExternalSourceItems');
		const refreshIndex = block.indexOf('await Promise.all([', deleteIndex);

		assert.ok(deleteIndex >= 0);
		assert.ok(refreshIndex > deleteIndex);
		assert.ok(block.slice(refreshIndex).includes('this.refreshPane(targetSide, { force: true })'));
		assert.ok(block.slice(refreshIndex).includes('this.refreshLocalPanesForWindowsPaths'));
	});

	test('refreshes both panes after pane-to-Windows cut batches finish', () => {
		const editor = readTurboFileEditor();
		const start = editor.indexOf('private async transferItemsToWindowsDirectory');
		const block = editor.slice(start, editor.indexOf('private async transferSelected', start));

		assert.ok(block.includes("if (operation === 'move')"));
		assert.ok(block.includes('this.refreshPane(sourceSide, { force: true })'));
		assert.ok(block.includes('this.refreshLocalPanesForWindowsPaths'));
	});

	test('routes a single cut through the transactional batch path', () => {
		const editor = readTurboFileEditor();
		const start = editor.indexOf('private async transferSelected');
		const block = editor.slice(start, editor.indexOf('private async transferItem', start));

		assert.ok(block.includes('if (shouldUseBatchTransfer(operation, sourceItems.length))'));
		assert.ok(block.includes('return this.transferItemsBatch(sourceSide, targetSide, sourceDevice, targetDevice, sourceItems, operation, initiatedAt)'));
		assert.ok(!block.includes('moveUserItemsToTrash'));
	});

	test('keeps batch cut cleanup permanently separate from explicit recycle-bin deletion', () => {
		const editor = readTurboFileEditor();
		const service = fs.readFileSync(path.join(process.cwd(), 'src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts'), 'utf8');
		const cleanupStart = service.indexOf('private async deleteBatchSources');
		const cleanupBlock = service.slice(cleanupStart, service.indexOf('private joinBatchTargetPath', cleanupStart));
		const explicitDeleteStart = editor.indexOf('private async deleteSelected');
		const explicitDeleteBlock = editor.slice(explicitDeleteStart, editor.indexOf('private removePaneItems', explicitDeleteStart));

		assert.ok(cleanupBlock.includes('fsp.rm('));
		assert.ok(cleanupBlock.includes('buildPosixDeleteManyFromInputCommand(true)'));
		assert.ok(!cleanupBlock.includes('movePathsToTrash'));
		assert.ok(explicitDeleteBlock.includes('moveUserItemsToTrash'));
	});

	test('defers post-drop transfers until after drag image teardown frames', () => {
		const editor = readTurboFileEditor();

		assert.ok(editor.includes('ownerWindow.requestAnimationFrame(() => {'));
		assert.ok(editor.includes('ownerWindow.requestAnimationFrame(action);'));
	});
});
