/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITurboFileReadImageOptions } from '../../../../platform/turbofile/common/turbofile.js';

/**
 * Sources at or below this size are previewed as the true original bytes — fast enough to stream
 * and keeps pixel-exact fidelity for the inspector/histogram.
 */
export const TURBOFILE_PREVIEW_ORIGINAL_MAX_BYTES = 8 * 1024 * 1024;

/**
 * Upper bound (px) for the long edge of a downscaled preview of a very large source. Shrink-only,
 * so anything already within the bound is returned untouched; only oversized images are reduced.
 * 4096 keeps the preview crisp at any normal display/zoom while making the payload small.
 */
export const TURBOFILE_PREVIEW_LARGE_MAX_DIMENSION = 4096;

/**
 * Builds the read options for the full-size image preview.
 *
 * Small/medium sources read at original size (forceOriginal) for pixel-exact fidelity. Very large
 * sources (e.g. 4K+ dense PNGs) are downscaled remotely to a display-resolution bound instead:
 * transferring tens of MB of original bytes over IPC was slow and intermittently failed ("No
 * response from server"), while a remote ImageMagick downscale returns in a fraction of the time
 * and stays visually identical at normal zoom. The shrink-only geometry means this never enlarges.
 */
export function createTurboFileImagePreviewReadOptions(sourceSize: number, sourceModified: number): ITurboFileReadImageOptions {
	if (Number.isFinite(sourceSize) && sourceSize > TURBOFILE_PREVIEW_ORIGINAL_MAX_BYTES) {
		return {
			encoding: 'base64',
			width: TURBOFILE_PREVIEW_LARGE_MAX_DIMENSION,
			height: TURBOFILE_PREVIEW_LARGE_MAX_DIMENSION,
			quality: 92,
			format: 'webp',
			interpolation: 'lanczos',
			maxBytes: 256 * 1024 * 1024,
			sourceSize,
			sourceModified
		};
	}
	return {
		encoding: 'base64',
		forceOriginal: true,
		maxBytes: 128 * 1024 * 1024,
		sourceSize,
		sourceModified
	};
}
