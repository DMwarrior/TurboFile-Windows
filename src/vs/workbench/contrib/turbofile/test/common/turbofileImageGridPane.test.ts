/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { getTurboFileImageGridPasteTargetSide } from '../../common/turbofileImageGridClipboard.js';

suite('TurboFileImageGridPane', () => {
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
		assert.ok(editor.includes('this.setImageGridSort(state, option.key);'));
		assert.ok(editor.includes('void this.deleteSelectedImageGridItems(state);'));
		assert.ok(editor.includes('this.selectAllImageGridItems(state);'));
		assert.ok(editor.includes('this.setImageGridColumns(state, state.columns - 1);'));
		assert.ok(editor.includes('this.setImageGridColumns(state, state.columns + 1);'));
	});

	test('updates image-grid deletion in place instead of re-rendering the whole editor', () => {
		const editor = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');
		assert.ok(editor.includes('private updateImageGridAfterLocalMutation(state: TurboFileImageGridState): void'));
		assert.ok(editor.includes('this.updateImageGridAfterLocalMutation(state);'));
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
