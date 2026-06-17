/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ITurboFileImageGridSourceSize {
	readonly width?: number;
	readonly height?: number;
}

export interface ITurboFileImageGridCardSize {
	readonly imageWidth: number;
	readonly imageHeight: number;
	readonly cardWidth: number;
	readonly rowHeight: number;
}

export function getTurboFileImageGridCardSize(source: ITurboFileImageGridSourceSize, scale: number, baseCardWidth: number, basePreviewHeight: number, cardVerticalChrome: number, cardInlineChrome: number): ITurboFileImageGridCardSize {
	const normalizedScale = normalizePositiveNumber(scale, 1);
	const baseWidth = Math.max(1, Math.round(baseCardWidth));
	const previewWidth = Math.max(1, baseWidth - Math.max(0, Math.round(cardInlineChrome)));
	const previewHeight = Math.max(1, Math.round(basePreviewHeight));
	const sourceWidth = normalizePositiveNumber(source.width, 0);
	const sourceHeight = normalizePositiveNumber(source.height, 0);
	const hasSourceSize = sourceWidth > 0 && sourceHeight > 0;
	const baseImageScale = hasSourceSize ? Math.min(previewWidth / sourceWidth, previewHeight / sourceHeight, 1) : 1;
	const baseImageWidth = hasSourceSize ? Math.max(1, Math.round(sourceWidth * baseImageScale)) : previewWidth;
	const baseImageHeight = hasSourceSize ? Math.max(1, Math.round(sourceHeight * baseImageScale)) : previewHeight;
	const imageWidth = Math.max(1, Math.round(baseImageWidth * normalizedScale));
	const imageHeight = Math.max(1, Math.round(baseImageHeight * normalizedScale));
	return {
		imageWidth,
		imageHeight,
		cardWidth: Math.max(baseWidth, Math.round(imageWidth + Math.max(0, cardInlineChrome))),
		rowHeight: Math.max(1, Math.round(Math.max(previewHeight, imageHeight) + Math.max(0, cardVerticalChrome)))
	};
}

export function getTurboFileImageGridEffectiveColumns(maxColumns: number, availableWidth: number, cardWidth: number, gap: number): number {
	const columns = Math.max(1, Math.round(maxColumns));
	const width = Math.max(1, Math.floor(availableWidth));
	const itemWidth = Math.max(1, Math.ceil(cardWidth));
	const itemGap = Math.max(0, Math.round(gap));
	return Math.max(1, Math.min(columns, Math.floor((width + itemGap) / (itemWidth + itemGap))));
}

function normalizePositiveNumber(value: number | undefined, fallback: number): number {
	return Number.isFinite(value) && value !== undefined && value > 0 ? value : fallback;
}
