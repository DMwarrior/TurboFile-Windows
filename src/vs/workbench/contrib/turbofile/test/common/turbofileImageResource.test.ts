/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { createTurboFileImageGridResourceOptions, createTurboFileImagePreviewResourceOptions, TURBOFILE_IMAGE_PREVIEW_ORIGINAL_MAX_BYTES } from '../../common/turbofileImageResource.js';

suite('TurboFileImageResource', () => {
	test('grid thumbnails request a decodable jpeg transform', () => {
		assert.deepStrictEqual(createTurboFileImageGridResourceOptions(384, 1234, 5678), {
			width: 384,
			quality: 72,
			format: 'jpeg',
			interpolation: 'lanczos',
			sourceSize: 1234,
			sourceModified: 5678
		});
	});

	test('non-Windows SSH previews stream the original image when it is small enough to rasterize', () => {
		assert.deepStrictEqual(createTurboFileImagePreviewResourceOptions(false, { width: 1536, height: 1024, quality: 82 }, TURBOFILE_IMAGE_PREVIEW_ORIGINAL_MAX_BYTES, 5678), {
			forceOriginal: true,
			maxBytes: 128 * 1024 * 1024,
			sourceSize: TURBOFILE_IMAGE_PREVIEW_ORIGINAL_MAX_BYTES,
			sourceModified: 5678
		});
	});

	test('non-Windows SSH previews downscale very large sources to a display-sized jpeg', () => {
		assert.deepStrictEqual(createTurboFileImagePreviewResourceOptions(false, { width: 1536, height: 1024, quality: 82 }, TURBOFILE_IMAGE_PREVIEW_ORIGINAL_MAX_BYTES + 1, 5678), {
			width: 1536,
			height: 1024,
			quality: 82,
			format: 'jpeg',
			interpolation: 'lanczos',
			maxBytes: 128 * 1024 * 1024,
			sourceSize: TURBOFILE_IMAGE_PREVIEW_ORIGINAL_MAX_BYTES + 1,
			sourceModified: 5678
		});
	});

	test('Windows SSH previews stream the original image when it is small enough to rasterize', () => {
		assert.deepStrictEqual(createTurboFileImagePreviewResourceOptions(true, { width: 1536, height: 1024, quality: 82 }, 1234, 5678), {
			forceOriginal: true,
			maxBytes: 128 * 1024 * 1024,
			sourceSize: 1234,
			sourceModified: 5678
		});
	});
});
