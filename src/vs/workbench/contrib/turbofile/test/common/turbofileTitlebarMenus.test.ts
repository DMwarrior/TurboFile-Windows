/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('TurboFileTitlebarMenus', () => {
	const readEditor = () => fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');
	const method = (editor: string, start: string, end: string) => editor.slice(editor.indexOf(start), editor.indexOf(end));

	test('exposes every requested settings action and persists user choices', () => {
		const editor = readEditor();
		const settings = method(editor, 'private getTitlebarSettingsActions()', 'private getTitlebarViewActions()');

		for (const id of [
			'turbofile.settings.confirmBeforeDelete',
			'turbofile.settings.imageGridQuality',
			'turbofile.settings.showImageGridNames',
			'turbofile.settings.imageGridSizeSortBasis',
			'turbofile.settings.conflictPolicy',
			'turbofile.settings.automaticUpdates',
			'turbofile.settings.showHiddenFiles'
		]) {
			assert.ok(settings.includes(id), `missing settings action ${id}`);
		}

		assert.ok(editor.includes("'turbofile.imageGrid.quality'"));
		assert.ok(editor.includes("StorageScope.PROFILE, 'thumbnail') === 'original'"));
		assert.ok(editor.includes("'turbofile.imageGrid.showNames'"));
		assert.ok(editor.includes("'turbofile.imageGrid.sizeSortBasis'"));
		assert.ok(editor.includes("StorageScope.PROFILE, 'file') === 'dimensions'"));
		assert.ok(editor.includes('StorageScope.PROFILE, true'));
		assert.ok(editor.includes("'turbofile.transfer.conflictPolicy'"));
		assert.ok(editor.includes('IMAGE_GRID_COLUMN_MAX = 32'));
		assert.ok(editor.includes('IMAGE_GRID_COLUMN_DEFAULT = 14'));
		assert.ok(editor.includes('return clampNumber(rounded, IMAGE_GRID_COLUMN_MIN, IMAGE_GRID_COLUMN_MAX);'));
		assert.ok(editor.includes('IMAGE_GRID_THUMB_MIN_AT_MAX_COLUMNS = 48'));
		assert.ok(editor.includes('state.columns - IMAGE_GRID_COLUMN_DEFAULT'));
		assert.ok(editor.includes('StorageScope.PROFILE, StorageTarget.USER'));
		assert.ok(editor.includes("updateValue('update.mode'"));
	});

	test('switches image-grid source quality without removing thumbnail fallback', () => {
		const editor = readEditor();
		const batchLoad = method(editor, 'private async loadImageGridThumbnailsBatch(', 'private applyBatchedImageGridThumbnail(');
		const batchAssign = method(editor, 'private async assignBatchedThumbnail(', 'private async createDownscaledThumbnailUrl(');
		const singleLoad = method(editor, 'private async applySshThumbnailViaProtocol(', 'private getImageGridThumbnailRequestWidth(');

		assert.ok(batchLoad.includes('this.shouldUseOriginalImageGridImages() ? 0 : targetWidth'));
		assert.ok(batchAssign.includes('!this.shouldUseOriginalImageGridImages()'));
		assert.ok(singleLoad.includes('forceOriginal: true'));
		assert.ok(singleLoad.includes('maxBytes: TURBOFILE_IMAGE_GRID_ORIGINAL_MAX_BYTES'));
		assert.ok(singleLoad.includes('highQuality = this.shouldUseOriginalImageGridImages()'));
		assert.ok(singleLoad.includes('if (highQuality && !result.ok)'));
		assert.ok(singleLoad.includes("format: 'webp'"));
	});

	test('applies conflict policy to every transfer entry point without exposing task concurrency', () => {
		const editor = readEditor();
		const resolveConflicts = method(editor, 'private async resolveTransferConflictItems(', 'private async pasteInternalTransferClipboard(');

		for (const policy of ["'ask'", "'overwrite'", "'skip'", "'keepBoth'"]) {
			assert.ok(resolveConflicts.includes(policy), `missing conflict policy ${policy}`);
		}
		assert.ok(resolveConflicts.includes('this.quickInputService.pick'));
		assert.ok(resolveConflicts.includes('createTurboFileCopyNames'));
		assert.strictEqual(editor.match(/resolveTransferConflictItems\(sourceItems, targetSide\)/g)?.length, 3);
		assert.ok(!editor.includes('turbofile.settings.maximumParallelTasks'));
		assert.ok(!editor.includes('turbofile.transfer.maxParallelTasks'));
		assert.ok(!editor.includes('schedulerConcurrency:'));
	});

	test('wires view choices to rendering, navigation, terminal reuse and refresh', () => {
		const editor = readEditor();
		const view = method(editor, 'private getTitlebarViewActions()', 'private getTitlebarHelpActions()');
		for (const id of [
			'turbofile.view.showHiddenFiles',
			'turbofile.view.showFileSize',
			'turbofile.view.showModified',
			'turbofile.view.showFileType',
			'turbofile.view.showImageGridHoverInfo',
			'turbofile.view.displayMode',
			'turbofile.view.showTaskbar',
			'turbofile.view.showTerminal',
			'turbofile.view.syncPaneNavigation',
			'turbofile.view.maximizeLeft',
			'turbofile.view.maximizeRight',
			'turbofile.view.restorePanes',
			'turbofile.view.zoomOut',
			'turbofile.view.zoomIn',
			'turbofile.view.font',
			'turbofile.view.editorFontSize',
			'turbofile.view.uiFontSize',
			'turbofile.view.uiFontFamily',
			'turbofile.view.fileListFontSize',
			'turbofile.view.fileListFontFamily',
			'turbofile.view.theme',
			'turbofile.view.refresh'
		]) {
			assert.ok(view.includes(id), `missing view action ${id}`);
		}

		assert.ok(editor.includes('this.shouldShowHiddenFiles() || !isHiddenFileName(entry.name)'));
		assert.ok(editor.includes('if (this.shouldShowFileSize())'));
		assert.ok(editor.includes('if (this.shouldShowFileModified())'));
		assert.ok(editor.includes('if (this.shouldShowFileType())'));
		assert.ok(editor.includes("const TURBOFILE_IMAGE_GRID_SHOW_HOVER_INFO_STORAGE_KEY = 'turbofile.imageGrid.showHoverInfo';"));
		assert.ok(editor.includes('private shouldShowImageGridHoverInfo(): boolean'));
		assert.ok(editor.includes('StorageScope.PROFILE, true'));
		assert.ok(editor.includes('if (!this.shouldShowImageGridHoverInfo())'));
		assert.ok(editor.includes('if (this.shouldShowTaskbar())'));
		assert.ok(editor.includes('this.syncPaneNavigationFrom(side, path)'));
		assert.ok(editor.includes('columns: IMAGE_GRID_COLUMN_DEFAULT'));
		assert.ok(editor.includes('this.getBoundTerminalsForPage(pageInstanceId).length > 0'));
		assert.ok(editor.includes('this.revealBoundTerminalsForPage(pageInstanceId, undefined, true)'));
	});

	test('provides every requested help entry with working update and license handlers', () => {
		const editor = readEditor();
		const help = method(editor, 'private getTitlebarHelpActions()', 'private createCheckedAction(');
		for (const id of [
			'turbofile.help.guide',
			'turbofile.help.shortcuts',
			'turbofile.help.protocols',
			'turbofile.help.checkUpdates',
			'turbofile.help.releaseNotes',
			'turbofile.help.about',
			'turbofile.help.licenses'
		]) {
			assert.ok(help.includes(id), `missing help action ${id}`);
		}

		assert.ok(help.includes('this.updateService.checkForUpdates(true)'));
		assert.ok(editor.includes("joinPath(FileAccess.asFileUri(''), '..', 'ThirdPartyNotices.txt')"));
		assert.ok(editor.includes('this.textEditorService.resolveTextEditor(editorInput)'));
	});
});
