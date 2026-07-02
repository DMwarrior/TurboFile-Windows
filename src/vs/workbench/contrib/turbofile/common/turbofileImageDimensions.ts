/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ITurboFileImageDimensions {
	readonly width?: number;
	readonly height?: number;
	readonly originalWidth?: number;
	readonly originalHeight?: number;
}

export function getTurboFileImageDimensions(image: ITurboFileImageDimensions): { readonly width: number; readonly height: number } | undefined {
	const originalWidth = toPositiveInteger(image.originalWidth);
	const originalHeight = toPositiveInteger(image.originalHeight);
	if (originalWidth !== undefined && originalHeight !== undefined) {
		return { width: originalWidth, height: originalHeight };
	}

	const width = toPositiveInteger(image.width);
	const height = toPositiveInteger(image.height);
	if (width !== undefined && height !== undefined) {
		return { width, height };
	}

	return undefined;
}

export function formatTurboFileImageDimensions(image: ITurboFileImageDimensions, separator = ' × '): string {
	const dimensions = getTurboFileImageDimensions(image);
	return dimensions ? `${dimensions.width}${separator}${dimensions.height}` : '';
}

function toPositiveInteger(value: number | undefined): number | undefined {
	if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
		return undefined;
	}
	return Math.max(1, Math.round(value));
}
