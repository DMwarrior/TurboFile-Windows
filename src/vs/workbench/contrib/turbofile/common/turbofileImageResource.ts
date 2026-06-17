/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITurboFileImageResourceOptions } from '../../../../platform/turbofile/common/turbofile.js';

export const TURBOFILE_IMAGE_GRID_RESOURCE_QUALITY = 72;
export const TURBOFILE_IMAGE_PREVIEW_RESOURCE_QUALITY = 82;
export const TURBOFILE_IMAGE_PREVIEW_MAX_BYTES = 128 * 1024 * 1024;

/**
 * Sources larger than this read as the true original for the preview. Above it, the original is
 * almost always a high-megapixel image (e.g. super-resolution PNGs) that the renderer's <img>
 * decoder refuses to rasterize ("Failed to load image"), so it is downscaled to a display bound
 * instead. The shrink-only geometry means smaller images keep their native size.
 */
export const TURBOFILE_IMAGE_PREVIEW_ORIGINAL_MAX_BYTES = 12 * 1024 * 1024;

export interface ITurboFileImagePreviewResourceSize {
	readonly width: number;
	readonly height: number;
	readonly quality: number;
}

export function createTurboFileImageGridResourceOptions(width: number, sourceSize: number, sourceModified: number): ITurboFileImageResourceOptions {
	return {
		width,
		quality: TURBOFILE_IMAGE_GRID_RESOURCE_QUALITY,
		// JPEG, not WebP: some servers' ImageMagick WebP delegate produced byte streams that passed a
		// shallow magic-byte check but that this build's Chromium <img> decoder rejected for certain
		// sources, leaving grid cards on the generic file icon. JPEG decodes universally and is
		// verifiable in the main process before it is served.
		format: 'jpeg',
		interpolation: 'lanczos',
		sourceSize,
		sourceModified
	};
}

export function createTurboFileImagePreviewResourceOptions(isWindowsSsh: boolean, request: ITurboFileImagePreviewResourceSize, sourceSize: number, sourceModified: number): ITurboFileImageResourceOptions {
	// Read the true original only when it is small enough to be both transferred quickly and
	// rasterized by the renderer. Windows SSH and very large sources are downscaled to a display
	// bound so the preview always loads regardless of source dimensions.
	const mustDownscale = isWindowsSsh || (Number.isFinite(sourceSize) && sourceSize > TURBOFILE_IMAGE_PREVIEW_ORIGINAL_MAX_BYTES);
	if (!mustDownscale) {
		return {
			forceOriginal: true,
			maxBytes: TURBOFILE_IMAGE_PREVIEW_MAX_BYTES,
			sourceSize,
			sourceModified
		};
	}

	return {
		width: request.width,
		height: request.height,
		quality: request.quality,
		format: 'jpeg',
		interpolation: 'lanczos',
		maxBytes: TURBOFILE_IMAGE_PREVIEW_MAX_BYTES,
		sourceSize,
		sourceModified
	};
}
