/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITurboFileImageResourceOptions } from '../../../../platform/turbofile/common/turbofile.js';

export const TURBOFILE_IMAGE_GRID_RESOURCE_QUALITY = 72;
export const TURBOFILE_IMAGE_PREVIEW_RESOURCE_QUALITY = 82;
export const TURBOFILE_IMAGE_PREVIEW_MAX_BYTES = 128 * 1024 * 1024;

export interface ITurboFileImagePreviewResourceSize {
	readonly width: number;
	readonly height: number;
	readonly quality: number;
}

export function createTurboFileImageGridResourceOptions(width: number, sourceSize: number, sourceModified: number): ITurboFileImageResourceOptions {
	return {
		width,
		quality: TURBOFILE_IMAGE_GRID_RESOURCE_QUALITY,
		format: 'webp',
		interpolation: 'lanczos',
		sourceSize,
		sourceModified
	};
}

export function createTurboFileImagePreviewResourceOptions(isWindowsSsh: boolean, request: ITurboFileImagePreviewResourceSize, sourceSize: number, sourceModified: number): ITurboFileImageResourceOptions {
	if (!isWindowsSsh) {
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
		format: 'webp',
		interpolation: 'lanczos',
		maxBytes: TURBOFILE_IMAGE_PREVIEW_MAX_BYTES,
		sourceSize,
		sourceModified
	};
}
