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

export function getTurboFileImageGridCardSize(source: ITurboFileImageGridSourceSize, scale: number, minPreviewSize: number, cardVerticalChrome: number, cardInlineChrome: number): ITurboFileImageGridCardSize {
	const normalizedScale = normalizePositiveNumber(scale, 1);
	const minSize = Math.max(1, Math.round(minPreviewSize));
	const sourceWidth = normalizePositiveNumber(source.width, 0);
	const sourceHeight = normalizePositiveNumber(source.height, 0);
	const hasSourceSize = sourceWidth > 0 && sourceHeight > 0;
	const imageWidth = hasSourceSize ? Math.max(1, Math.round(sourceWidth * normalizedScale)) : minSize;
	const imageHeight = hasSourceSize ? Math.max(1, Math.round(sourceHeight * normalizedScale)) : minSize;
	const previewWidth = Math.max(minSize, imageWidth);
	const previewHeight = Math.max(minSize, imageHeight);
	return {
		imageWidth,
		imageHeight,
		cardWidth: Math.max(1, Math.round(previewWidth + Math.max(0, cardInlineChrome))),
		rowHeight: Math.max(1, Math.round(previewHeight + Math.max(0, cardVerticalChrome) + Math.max(0, cardInlineChrome)))
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
