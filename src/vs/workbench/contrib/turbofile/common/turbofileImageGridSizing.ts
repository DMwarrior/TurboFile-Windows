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

// Clamp the aspect ratio used for laying out a card. Without this, an extreme-aspect image (e.g. a
// 1024x32 crop) makes its card either freakishly wide — which inflates the grid's column width and
// leaves big gaps between every other card — or, fitted into the square preview, a ~4px sliver that
// looks like a stray dot. Clamping keeps the card a sane shape; the image itself fills it via CSS
// object-fit: cover, so a very wide/tall picture shows a centered crop instead of a sliver.
const MAX_GRID_CARD_ASPECT = 2.2;

export function getTurboFileImageGridCardSize(source: ITurboFileImageGridSourceSize, scale: number, baseCardWidth: number, basePreviewHeight: number, cardVerticalChrome: number, cardInlineChrome: number): ITurboFileImageGridCardSize {
	const normalizedScale = normalizePositiveNumber(scale, 1);
	const baseWidth = Math.max(1, Math.round(baseCardWidth));
	const previewWidth = Math.max(1, baseWidth - Math.max(0, Math.round(cardInlineChrome)));
	const previewHeight = Math.max(1, Math.round(basePreviewHeight));
	const rawWidth = normalizePositiveNumber(source.width, 0);
	const rawHeight = normalizePositiveNumber(source.height, 0);
	const hasSourceSize = rawWidth > 0 && rawHeight > 0;
	let sourceWidth = rawWidth;
	let sourceHeight = rawHeight;
	if (hasSourceSize) {
		const ratio = rawWidth / rawHeight;
		if (ratio > MAX_GRID_CARD_ASPECT) {
			sourceHeight = rawWidth / MAX_GRID_CARD_ASPECT;
		} else if (ratio < 1 / MAX_GRID_CARD_ASPECT) {
			sourceWidth = rawHeight / MAX_GRID_CARD_ASPECT;
		}
	}
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
