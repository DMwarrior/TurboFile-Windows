/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { getTurboFileImageGridPasteTargetSide } from '../../common/turbofileImageGridClipboard.js';

suite('TurboFileImageGridPane', () => {
	test('retains each pane image root across renders caused by the opposite pane', () => {
		const editor = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');
		const renderImageGrid = editor.slice(editor.indexOf('private renderImageGridPage('), editor.indexOf('private reflowAttachedImageGridBody('));
		const releaseState = editor.slice(editor.indexOf('private releaseImageGridState('), editor.indexOf('private releaseAllImageGridStates('));

		assert.deepStrictEqual({
			stateOwnsRoot: editor.includes('retainedPaneRoot?: HTMLElement;'),
			stateOwnsDisposables: editor.includes('paneDomDisposables?: DisposableStore;'),
			reusesRoot: renderImageGrid.includes('state.retainedPaneRoot'),
			disposesListeners: releaseState.includes('state.paneDomDisposables?.dispose()'),
			clearsRoot: releaseState.includes('state.retainedPaneRoot = undefined')
		}, {
			stateOwnsRoot: true,
			stateOwnsDisposables: true,
			reusesRoot: true,
			disposesListeners: true,
			clearsRoot: true
		});
	});

	test('pastes into the focused pane grid when clipboard came from the other side', () => {
		assert.deepStrictEqual([
			getTurboFileImageGridPasteTargetSide('right', 'left'),
			getTurboFileImageGridPasteTargetSide('left', 'right'),
			getTurboFileImageGridPasteTargetSide('left', 'left'),
			getTurboFileImageGridPasteTargetSide('right', undefined)
		], [
			'right',
			'left',
			'right',
			'left'
		]);
	});

	test('reflows pane grids after DOM attach and lets local drop targets own image-grid drops', () => {
		const editor = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');
		assert.ok(editor.includes('this.reflowAttachedImageGridBody(body, state, scrollTop);'));
		assert.ok(editor.includes('this.shouldLetConcreteDropTargetHandle(event)'));
		assert.ok(editor.includes('getTurboFileImageGridPasteTargetSide(state.side, this.internalTransferClipboard?.sourceSide)'));
	});

	test('keeps left and right pane image-grid toolbar actions bound to their own state', () => {
		const editor = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');
		assert.ok(editor.includes('this.setImageGridColumns(state, option);'));
		assert.ok(editor.includes('this.setImageGridThumbnailScale(state, scale);'));
		assert.ok(editor.includes('this.setImageGridSortKey(state, option.key);'));
		assert.ok(editor.includes('void this.deleteSelectedImageGridItems(state);'));
		assert.ok(editor.includes('this.selectAllImageGridItems(state);'));
		assert.ok(editor.includes('this.setImageGridColumns(state, state.columns - 1);'));
		assert.ok(editor.includes('this.setImageGridColumns(state, state.columns + 1);'));
	});

	test('sorts image grid from file-list metadata without scanning image headers', () => {
		const editor = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');
		const sortOptions = editor.slice(
			editor.indexOf('const IMAGE_GRID_SORT_OPTIONS'),
			editor.indexOf('const IMAGE_GRID_COLUMN_MIN')
		);
		const setSortKey = editor.slice(
			editor.indexOf('private setImageGridSortKey('),
			editor.indexOf('private setImageGridSortDirection(')
		);

		assert.ok(sortOptions.includes("{ key: 'size',"));
		assert.ok(!sortOptions.includes("'dimensions'"));
		assert.ok(editor.includes('private imageGridSortDescending = true;'));
		assert.ok(editor.includes('sortTurboFileImageGridItems('));
		assert.ok(editor.includes('rawSize: image.item.rawSize'));
		assert.ok(editor.includes('sizeKnown: !image.item.attrsPending'));
		assert.ok(!editor.includes('this.sshService.readImageMetadataBatch(endpoint, paths)'));
		assert.ok(!editor.includes('private prepareImageGridSortMetadata('));
		assert.ok(!editor.includes('private resortImageGridAfterSizeUpdate('));
		assert.ok(editor.includes('state.thumbnailLoadToken++;'));
		assert.ok(editor.includes('const currentIndex = state.images.indexOf(image);'));
		assert.ok(editor.includes('const currentIndex = state.images.indexOf(target.image);'));
		assert.ok(editor.includes('state.previewPendingIndex = undefined;'));
		assert.ok(setSortKey.includes('state.sortKey === key ? state.sortDescending : true'));
	});

	test('carries original dimensions beside transformed SSH thumbnail bytes', () => {
		const editor = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');
		const service = fs.readFileSync(path.join(process.cwd(), 'src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts'), 'utf8');
		const contract = fs.readFileSync(path.join(process.cwd(), 'src/vs/platform/turbofile/common/turbofile.ts'), 'utf8');
		const batchEntry = contract.slice(contract.indexOf('export interface ITurboFileImageBatchEntry'), contract.indexOf('export interface ITurboFileImageMetadataEntry'));
		const batchCommand = service.slice(service.indexOf('function buildPosixReadImagesBatchCommand('), service.indexOf('function parseImageBatchOutput('));
		const batchParser = service.slice(service.indexOf('function parseImageBatchOutput('), service.indexOf('function buildPosixDeleteCommand('));
		const applyThumbnail = editor.slice(editor.indexOf('private applyBatchedImageGridThumbnail('), editor.indexOf('private async assignBatchedThumbnail('));

		assert.deepStrictEqual({
			contractWidth: batchEntry.includes('readonly originalWidth?: number;'),
			contractHeight: batchEntry.includes('readonly originalHeight?: number;'),
			frameWidth: batchCommand.includes('"$originalWidth"'),
			frameHeight: batchCommand.includes('"$originalHeight"'),
			parserWidth: batchParser.includes('originalWidth'),
			parserHeight: batchParser.includes('originalHeight'),
			editorWidth: applyThumbnail.includes('target.image.originalWidth = entry.originalWidth ?? target.image.originalWidth;'),
			editorHeight: applyThumbnail.includes('target.image.originalHeight = entry.originalHeight ?? target.image.originalHeight;')
		}, {
			contractWidth: true,
			contractHeight: true,
			frameWidth: true,
			frameHeight: true,
			parserWidth: true,
			parserHeight: true,
			editorWidth: true,
			editorHeight: true
		});
	});

	test('updates only the active image grid when sorting', () => {
		const editor = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');
		const applySort = editor.slice(
			editor.indexOf('private applyImageGridSort('),
			editor.indexOf('private resortImageGridState(')
		);

		assert.ok(applySort.includes('this.updateImageGridAfterSort(state);'));
		assert.ok(!applySort.includes('this.render();'));
		assert.ok(!applySort.includes('this.clearImageGridLoadedImageIndexes(state);'));
		assert.ok(editor.includes('private updateImageGridAfterSort(state: TurboFileImageGridState): void'));
	});

	test('renders image-grid sort fields and direction as separate menu groups', () => {
		const editor = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');
		const renderSort = editor.slice(
			editor.indexOf('private renderImageGridSortControl('),
			editor.indexOf('private renderImageGridSlice(')
		);

		assert.ok(editor.includes('const IMAGE_GRID_SORT_DIRECTION_OPTIONS'));
		assert.ok(renderSort.includes('turbofile-image-page-sort-divider'));
		assert.ok(renderSort.includes('for (const option of IMAGE_GRID_SORT_DIRECTION_OPTIONS)'));
		assert.ok(renderSort.includes('this.setImageGridSortKey(state, option.key);'));
		assert.ok(renderSort.includes('this.setImageGridSortDirection(state, option.descending);'));
		assert.ok(!renderSort.includes('item.appendChild(renderIcon(state.sortDescending ? Codicon.arrowDown : Codicon.arrowUp));'));
	});

	test('updates image-grid deletion in place instead of re-rendering the whole editor', () => {
		const editor = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');
		assert.ok(editor.includes('private updateImageGridAfterLocalMutation(state: TurboFileImageGridState): void'));
		assert.ok(editor.includes('this.updateImageGridAfterLocalMutation(state);'));
	});

	test('routes explicit pane and image deletion through the recycle-bin service', () => {
		const editor = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');
		const deleteSelected = editor.slice(editor.indexOf('private async deleteSelected('), editor.indexOf('private async moveUserItemsToTrash('));
		const deleteGrid = editor.slice(editor.indexOf('private async deleteSelectedImageGridItems('), editor.indexOf('private async deleteImageGridPreview('));
		const deletePreview = editor.slice(editor.indexOf('private async deleteImageGridPreview('), editor.indexOf('private setImageGridColumns('));

		assert.ok(deleteSelected.includes('moveUserItemsToTrash'));
		assert.ok(deleteGrid.includes('moveUserItemsToTrash'));
		assert.ok(deletePreview.includes('moveUserItemsToTrash'));
		assert.ok(editor.includes('this.sshService.movePathsToTrash({'));
	});

	test('places the per-pane recycle-bin button immediately after explicit delete', () => {
		const editor = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');
		const renderPane = editor.slice(editor.indexOf('private renderPane('), editor.indexOf('private renderDeviceSelect('));
		const deleteIndex = renderPane.indexOf("'删除选中项'");
		const recycleIndex = renderPane.indexOf('this.appendRecycleBinButton(toolbar, side);');
		const copyPathIndex = renderPane.indexOf("'复制当前路径'");

		assert.ok(deleteIndex >= 0);
		assert.ok(deleteIndex < recycleIndex);
		assert.ok(recycleIndex < copyPathIndex);
		assert.ok(editor.includes('trashMode: leaveTurboFileTrashView()'));
	});

	test('renders the bundled Windows Recycle Bin artwork without the old status badge', () => {
		const editor = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');
		const css = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/media/turbofile.css'), 'utf8');
		const appendRecycleBinButton = editor.slice(editor.indexOf('private appendRecycleBinButton('), editor.indexOf('private createButton('));

		assert.ok(appendRecycleBinButton.includes('getTurboFileRecycleBinIcon(state.trashHasItems)'));
		assert.ok(appendRecycleBinButton.includes("document.createElement('img')"));
		assert.ok(!appendRecycleBinButton.includes('renderIcon(Codicon.trash)'));
		assert.ok(!css.includes('.turbofile-recycle-bin-button.is-full .turbofile-recycle-bin-icon::after'));
	});

	test('keeps the previous Chinese danger confirmation while ordinary deletion moves items to trash', () => {
		const editor = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');
		const deleteSelected = editor.slice(editor.indexOf('private async deleteSelected('), editor.indexOf('private async moveUserItemsToTrash('));
		const deleteGrid = editor.slice(editor.indexOf('private async deleteSelectedImageGridItems('), editor.indexOf('private async deleteImageGridPreview('));
		const deletePreview = editor.slice(editor.indexOf('private async deleteImageGridPreview('), editor.indexOf('private setImageGridColumns('));

		assert.ok(deleteSelected.includes("showDialogConfirm('删除确认'"));
		assert.ok(deleteSelected.includes('确定删除选中的'));
		assert.ok(deleteGrid.includes("showDialogConfirm('删除图片'"));
		assert.ok(deleteGrid.includes('确定删除选中的'));
		assert.ok(deletePreview.includes("showDialogConfirm('删除图片'"));
		for (const method of [deleteSelected, deleteGrid, deletePreview]) {
			assert.ok(method.includes('moveUserItemsToTrash'));
			assert.ok(!method.includes('moveToRecycleBinTitle'));
		}
	});

	test('times out stalled preview element decodes so image preview can recover', () => {
		const editor = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');
		assert.ok(editor.includes('IMAGE_PREVIEW_ELEMENT_LOAD_TIMEOUT_MS'));
		assert.ok(editor.includes('clearImagePreviewElementLoadingState(image, key);'));
		assert.ok(editor.includes('return this.withImagePreviewElementLoadTimeout(loader, src);'));
	});

	test('handles pane clipboard shortcuts from the workbench capture handler without full rerender', () => {
		const editor = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');

		assert.ok(editor.includes('private handlePaneKeyboardShortcut(event: KeyboardEvent): boolean'));
		assert.ok(editor.includes('if (this.handlePaneKeyboardShortcut(event))'));
		assert.ok(editor.includes("this.copySelectedToInternalClipboard(side, key === 'x' ? 'move' : 'copy', false);"));
		assert.ok(editor.includes('void this.pasteIntoPane(side);'));
	});

	test('keeps transient image batch failures retryable in the current directory', () => {
		const editor = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');
		const service = fs.readFileSync(path.join(process.cwd(), 'src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts'), 'utf8');
		const contract = fs.readFileSync(path.join(process.cwd(), 'src/vs/platform/turbofile/common/turbofile.ts'), 'utf8');

		assert.ok(contract.includes('readonly transient?: boolean;'));
		assert.ok(service.includes('transient: true'));
		assert.ok(editor.includes('private retryImageGridThumbnailChunkAfterTransientFailure('));
		assert.ok(editor.includes('entries.some(entry => entry.transient)'));
		assert.ok(editor.includes('target.image.thumbnailError = undefined;'));
		assert.ok(editor.includes('this.scheduleImageGridTransientRetry(state);'));
	});

	test('drops stale preview sources after element decode failure so preview can reload', () => {
		const editor = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');

		assert.ok(editor.includes('private retryImageGridPreviewAfterDecodeFailure('));
		assert.ok(editor.includes('image.previewDecodeFailures'));
		assert.ok(editor.includes('this.releaseImageBlobUrl(image.previewUrl);'));
		assert.ok(editor.includes('void this.ensureImageGridPreviewLoaded(state, index, this.imageGridPreviewRequestSeq);'));
	});

	test('keeps pane preview controls bound to the preview-visible state', () => {
		const editor = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');

		assert.ok(editor.includes('private getActiveImageGridPreviewState(): TurboFileImageGridState | undefined'));
		assert.ok(editor.includes('const previewState = this.getActiveImageGridPreviewState();'));
		assert.ok(editor.includes('this.renderImagePreviewOverlay(previewState)'));
		assert.ok(editor.includes('this.getActiveImageGridPreviewState() !== state'));
		assert.ok(editor.includes('private moveImageGridPreview(delta: number, state: TurboFileImageGridState | undefined = this.getActiveImageGridPreviewState()): void'));
		assert.ok(editor.includes('private toggleImagePreviewPixelInspector(state: TurboFileImageGridState | undefined = this.getActiveImageGridPreviewState()): void'));
	});

	test('keeps single-image preview smoothing as the default while preserving selected sampling across preview navigation', () => {
		const editor = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');
		const commitPreviewIndex = editor.slice(
			editor.indexOf('private commitImageGridPreviewIndexIfReady('),
			editor.indexOf('private openImageGridPreview(')
		);

		assert.ok(editor.includes("private readonly defaultImagePreviewSamplingMode: TurboFileImagePreviewSamplingMode = 'smooth';"));
		assert.ok(editor.includes('state.previewSamplingMode = this.defaultImagePreviewSamplingMode;'));
		assert.ok(!editor.includes('this.imagePreviewSamplingMode = state.previewSamplingMode;'));
		assert.ok(!commitPreviewIndex.includes('state.previewSamplingMode = this.defaultImagePreviewSamplingMode;'));
		assert.ok(editor.includes("render.context.imageSmoothingQuality = 'low';"));
	});

	test('draws single-image previews with ImageGlass-style clipped source rects and linear sampling', () => {
		const editor = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');

		assert.ok(editor.includes('private getImagePreviewDrawRects('));
		assert.ok(editor.includes("render.context.imageSmoothingQuality = 'low';"));
		assert.ok(editor.includes('render.context.drawImage(render.image, draw.sourceX, draw.sourceY, draw.sourceWidth, draw.sourceHeight, draw.destX, draw.destY, draw.destWidth, draw.destHeight);'));
		assert.ok(editor.includes('const imageX = draw.sourceX + (event.clientX - canvasRect.left - draw.destX) * (draw.sourceWidth / draw.destWidth);'));
	});

	test('sizes grid thumbnail requests from the rendered preview box for high-DPI clarity', () => {
		const editor = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');
		const requestWidth = editor.slice(
			editor.indexOf('private getImageGridThumbnailRequestWidth('),
			editor.indexOf('private shouldUseOriginalImageGridCardSource(')
		);

		assert.ok(requestWidth.includes('this.getImageGridMaxCardWidth(state) - IMAGE_GRID_CARD_INLINE_CHROME'));
		assert.ok(!requestWidth.includes('this.getImageGridMaxImageWidth(state)'));
		assert.ok(requestWidth.includes('ownerWindow?.devicePixelRatio || 1'));
	});

	test('loads Windows single-image previews through the same original-first options as SSH previews', () => {
		const editor = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');

		assert.ok(editor.includes("import { createTurboFileImagePreviewReadOptions } from '../common/turbofileImagePreview.js';"));
		assert.ok(editor.includes('await this.readImageGridImage(device, image.item.path, createTurboFileImagePreviewReadOptions(image.item.rawSize, image.item.rawModified));'));
		assert.ok(!editor.includes('width: request.width,\n\t\t\t\theight: request.height,\n\t\t\t\tquality: request.quality,\n\t\t\t\tformat: \'jpeg\','));
	});
});
