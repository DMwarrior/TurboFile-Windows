/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('TurboFileRecycleBinInteraction', () => {
	const readEditor = () => fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');
	const readCss = () => fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/media/turbofile.css'), 'utf8');

	test('renders the recycle bin with the normal directory toolbar and rows', () => {
		const editor = readEditor();
		const css = readCss();
		const renderPane = editor.slice(editor.indexOf('private renderPane('), editor.indexOf('private renderDeviceSelect('));
		const hiddenTrashToolbarActions = renderPane.slice(renderPane.indexOf('if (!state.trashMode.active)'), renderPane.indexOf("this.appendToolbarButton(toolbar, Codicon.copy, '复制当前路径'"));
		const trashExtras = renderPane.slice(renderPane.indexOf('if (state.trashMode.active)'));

		assert.deepStrictEqual({
			normalRow: !editor.includes("row.classList.add('is-trash-item')") && editor.includes('size.textContent = item.size;'),
			normalToolbar: renderPane.indexOf('this.appendPaneSortButton(toolbar, side, toolbarAccent);') < renderPane.indexOf('if (state.trashMode.active)'),
			normalActions: ['appendDragOperationButton', "'搜索'", "'复制当前路径'", "'展开图片'", "'打开终端'"].every(value => renderPane.includes(value)),
			hidesDeleteAndRecycleButtons: hiddenTrashToolbarActions.includes("'删除选中项'") && hiddenTrashToolbarActions.includes('appendRecycleBinButton'),
			backRestoreAndEmptyAreAdded: trashExtras.includes('Codicon.arrowLeft') && trashExtras.includes('Codicon.discard') && trashExtras.includes('Codicon.clearAll'),
			normalDrag: editor.includes('if (item.path && !item.parent && !renaming) {'),
			sortedOnLoad: /state\.items = this\.sortPaneItems\(side, mapTurboFileTrashItemsToRows\(listing\.items\)/.test(editor),
			noTrashPathRow: !css.includes('.turbofile-file-row.is-trash-item') && !editor.includes('turbofile-trash-original-path')
		}, {
			normalRow: true,
			normalToolbar: true,
			normalActions: true,
			hidesDeleteAndRecycleButtons: true,
			backRestoreAndEmptyAreAdded: true,
			normalDrag: true,
			sortedOnLoad: true,
			noTrashPathRow: true
		});
	});

	test('restores recycle-bin items to their original locations with conflict handling', () => {
		const editor = readEditor();
		const restore = editor.slice(editor.indexOf('private async restoreSelectedTrashItems'), editor.indexOf('private async permanentlyDeleteSelectedTrashItems'));
		const emptyTrash = editor.slice(editor.indexOf('private async emptyTrash'), editor.indexOf('private async compressSelected'));

		assert.deepStrictEqual({
			title: editor.includes('"{0} - 回收站"'),
			path: editor.includes('"{0} 回收站"'),
			back: editor.includes('"返回"'),
			restoreLabel: editor.includes('"还原选中项"') && editor.includes('"还原"'),
			empty: editor.includes('"清空回收站"'),
			restoreService: restore.includes("conflictPolicy: 'cancel'") && restore.includes("conflictPolicy: 'keepBoth'"),
			refreshesTrashAndOriginalDirectory: restore.includes('this.refreshTrashPane(side)') && restore.includes('this.refreshVisibleRestoredDirectories(items)'),
			emptyTask: emptyTrash.includes("this.beginTask('delete'") && emptyTrash.includes('this.updateTask(task') && emptyTrash.includes('this.finishTask(task')
		}, {
			title: true,
			path: true,
			back: true,
			restoreLabel: true,
			empty: true,
			restoreService: true,
			refreshesTrashAndOriginalDirectory: true,
			emptyTask: true
		});
	});

	test('opens trash payload files and confines deleted-directory navigation', () => {
		const editor = readEditor();

		assert.deepStrictEqual({
			openTrashItem: editor.includes('await this.openTrashItem(side, item)'),
			browseRefresh: editor.includes('refreshTrashBrowsePane(side'),
			confinedNavigation: editor.includes('isTurboFileTrashBrowsePathAllowed('),
			permanentBrowseDelete: editor.includes('permanentlyDeleteTrashBrowseItems(side)'),
			restoreContextMenu: editor.slice(editor.indexOf('private getFileContextActions('), editor.indexOf('private getPaneContextActions(')).includes("'turbofile.trash.restore'")
		}, {
			openTrashItem: true,
			browseRefresh: true,
			confinedNavigation: true,
			permanentBrowseDelete: true,
			restoreContextMenu: true
		});
	});

	test('applies the deletion-confirmation setting to permanent deletion and empty trash', () => {
		const editor = readEditor();
		const permanentDelete = editor.slice(editor.indexOf('private async permanentlyDeleteSelected('), editor.indexOf('private formatPermanentDeleteError'));
		const permanentBrowseDelete = editor.slice(editor.indexOf('private async permanentlyDeleteTrashBrowseItems('), editor.indexOf('private async refreshTrashPane'));
		const permanentTrashDelete = editor.slice(editor.indexOf('private async permanentlyDeleteSelectedTrashItems('), editor.indexOf('private async emptyTrash'));
		const emptyTrash = editor.slice(editor.indexOf('private async emptyTrash'), editor.indexOf('private async compressSelected'));
		const confirmDelete = editor.slice(editor.indexOf('private confirmDelete('), editor.indexOf('private getPaneContextActions('));

		assert.deepStrictEqual({
			permanentDelete: permanentDelete.includes('this.confirmDelete('),
			permanentBrowseDelete: permanentBrowseDelete.includes('this.confirmDelete('),
			permanentTrashDelete: permanentTrashDelete.includes('this.confirmDelete('),
			emptyTrash: emptyTrash.includes('this.confirmDelete('),
			disabledSettingSkipsDialog: confirmDelete.includes('if (!this.shouldConfirmBeforeDelete())') && confirmDelete.includes('return Promise.resolve(true);')
		}, {
			permanentDelete: true,
			permanentBrowseDelete: true,
			permanentTrashDelete: true,
			emptyTrash: true,
			disabledSettingSkipsDialog: true
		});
	});
});
