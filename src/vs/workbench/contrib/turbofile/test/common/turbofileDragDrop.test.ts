/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { getNextTurboFileDragOperation, getTurboFileDirectoryMoveRefreshPaths, getTurboFileDropEffect, getTurboFileRowDragEffectAllowed, resolveTurboFileDragOperation, shouldHandleTurboFilePaneDropAtPage } from '../../common/turbofileDragDrop.js';

suite('TurboFileDragDrop', () => {
	test('permits a same-pane move even when pane-to-pane drags copy', () => {
		const editor = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');
		const beginDragStart = editor.indexOf('private beginFileRowDrag');
		const beginDragEnd = editor.indexOf('private tryStartImmediateLocalWindowsDrag', beginDragStart);
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
		const editor = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');
		const css = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/media/turbofile.css'), 'utf8');

		assert.deepStrictEqual({
			button: editor.includes('this.appendDragOperationButton(toolbar, side)'),
			snapshot: editor.includes("setData('application/x-turbofile-operation', operation)"),
			internalDrop: editor.includes('this.transferSelected(sourceSide, targetSide, initiatedAt, operation)'),
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
		const editor = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');
		const requestStart = contract.indexOf('export interface ITurboFileStartWindowsDragRequest');
		const requestBlock = contract.slice(requestStart, contract.indexOf('export interface ITurboFileImageMetadataEntry', requestStart));

		assert.deepStrictEqual({
			requestOperation: requestBlock.includes("readonly operation?: 'copy' | 'move';"),
			snapshottedField: editor.includes('private currentFileDragOperation: TurboFileDragOperation | undefined;'),
			passesOperation: editor.includes('this.startWindowsFileDragFromPane(side, operation)'),
			moveUsesBatch: editor.includes("if (operation === 'copy' && items.length === 1)"),
			batchReceivesOperation: editor.includes('\n\t\t\t\toperation,\n\t\t\t\tprogressId,')
		}, {
			requestOperation: true,
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
		const editor = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');

		assert.ok(editor.includes('private consumeTurboFileDropEvent(event: DragEvent): void'));
		assert.ok(editor.includes('this.consumeTurboFileDropEvent(event);'));
	});

	test('normalizes external Windows paths before transferring them', () => {
		const editor = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');

		assert.ok(editor.includes('await this.sshService.normalizeLocalWindowsPaths(sourcePaths)'));
		assert.ok(editor.includes('await this.resolveExternalTransferItems(normalizedSourcePaths)'));
		assert.ok(editor.includes('const groupsByParent = new Map<string, ExternalPathParentGroup>();'));
		assert.ok(editor.includes('Math.min(EXTERNAL_PATH_PARENT_LIST_CONCURRENCY, groups.length)'));
	});

	test('starts folder and multi-item transfers without renderer size discovery', () => {
		const editor = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');
		const batchStart = editor.indexOf('private async transferItemsBatch');
		const batchEnd = editor.indexOf('private insertOptimisticPaneItem', batchStart);
		const batch = editor.slice(batchStart, batchEnd);

		assert.ok(batchStart >= 0);
		assert.ok(!batch.includes('fillBatchDirectorySizesInBackground'));
		assert.ok(!batch.includes('calculatePathSize'));
		assert.ok(batch.includes('task.trackTotalBytes ? Math.max(0, item.rawSize) : 0'));
	});

	test('deletes cut sources before refreshing source and target panes', () => {
		const editor = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');
		const start = editor.indexOf('private async pasteInternalTransferClipboard');
		const block = editor.slice(start, editor.indexOf('private isSameTransferTarget', start));
		const deleteIndex = block.indexOf('await this.deleteInternalClipboardSources');
		const refreshIndex = block.lastIndexOf('await this.refreshTransferPanes');

		assert.ok(deleteIndex >= 0);
		assert.ok(refreshIndex > deleteIndex);
	});

	test('refreshes external cut source and target only after source cleanup', () => {
		const editor = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');
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
		const editor = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');
		const start = editor.indexOf('private async transferItemsToWindowsDirectory');
		const block = editor.slice(start, editor.indexOf('private async transferSelected', start));

		assert.ok(block.includes("if (operation === 'move')"));
		assert.ok(block.includes('this.refreshPane(sourceSide, { force: true })'));
		assert.ok(block.includes('this.refreshLocalPanesForWindowsPaths'));
	});

	test('defers post-drop transfers until after drag image teardown frames', () => {
		const editor = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');

		assert.ok(editor.includes('ownerWindow.requestAnimationFrame(() => {'));
		assert.ok(editor.includes('ownerWindow.requestAnimationFrame(action);'));
	});
});
