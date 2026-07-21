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

	test('renders trash items like normal directory rows and exposes neutral sorting', () => {
		const editor = readEditor();
		const css = readCss();

		assert.deepStrictEqual({
			normalRow: !editor.includes("row.classList.add('is-trash-item')") && editor.includes('size.textContent = item.size;'),
			neutralSortInTrashToolbar: /if \(state\.trashMode\.active\)[\s\S]*?appendPaneSortButton\(toolbar, side\);/.test(editor),
			sortedOnLoad: /state\.items = this\.sortPaneItems\(side, mapTurboFileTrashItemsToRows\(listing\.items\)/.test(editor),
			noTrashPathRow: !css.includes('.turbofile-file-row.is-trash-item') && !editor.includes('turbofile-trash-original-path')
		}, {
			normalRow: true,
			neutralSortInTrashToolbar: true,
			sortedOnLoad: true,
			noTrashPathRow: true
		});
	});

	test('uses Chinese recycle-bin labels and task-backed destructive actions', () => {
		const editor = readEditor();
		const permanentDelete = editor.slice(editor.indexOf('private async permanentlyDeleteSelectedTrashItems'), editor.indexOf('private async emptyTrash'));
		const emptyTrash = editor.slice(editor.indexOf('private async emptyTrash'), editor.indexOf('private async copySelectedTrashOriginalPath'));

		assert.deepStrictEqual({
			title: editor.includes('"{0} - 回收站"'),
			path: editor.includes('"{0} 回收站"'),
			back: editor.includes('"返回"'),
			restore: editor.includes('"还原"'),
			permanent: editor.includes('"永久删除"'),
			empty: editor.includes('"清空回收站"'),
			refresh: editor.includes('"刷新"'),
			permanentTask: permanentDelete.includes("this.beginTask('delete'") && permanentDelete.includes('this.updateTask(task') && permanentDelete.includes('this.finishTask(task'),
			emptyTask: emptyTrash.includes("this.beginTask('delete'") && emptyTrash.includes('this.updateTask(task') && emptyTrash.includes('this.finishTask(task')
		}, {
			title: true,
			path: true,
			back: true,
			restore: true,
			permanent: true,
			empty: true,
			refresh: true,
			permanentTask: true,
			emptyTask: true
		});
	});

	test('opens trash payload files and confines deleted-directory navigation', () => {
		const editor = readEditor();

		assert.deepStrictEqual({
			openTrashItem: editor.includes('openTrashItem(side, item)'),
			browseRefresh: editor.includes('refreshTrashBrowsePane(side'),
			confinedNavigation: editor.includes('isTurboFileTrashBrowsePathAllowed('),
			permanentBrowseDelete: editor.includes('permanentlyDeleteTrashBrowseItems(side)')
		}, {
			openTrashItem: true,
			browseRefresh: true,
			confinedNavigation: true,
			permanentBrowseDelete: true
		});
	});
});
