/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { createTurboFileImagePreviewReadOptions, TURBOFILE_PREVIEW_LARGE_MAX_DIMENSION, TURBOFILE_PREVIEW_ORIGINAL_MAX_BYTES } from '../../common/turbofileImagePreview.js';

suite('TurboFileImagePreview', () => {
	test('small/medium sources read the original image for pixel-exact fidelity', () => {
		const options = createTurboFileImagePreviewReadOptions(TURBOFILE_PREVIEW_ORIGINAL_MAX_BYTES, 456);

		assert.deepStrictEqual(options, {
			encoding: 'base64',
			forceOriginal: true,
			maxBytes: 128 * 1024 * 1024,
			sourceSize: TURBOFILE_PREVIEW_ORIGINAL_MAX_BYTES,
			sourceModified: 456
		});
	});

	test('very large sources downscale remotely to a display-resolution bound', () => {
		const options = createTurboFileImagePreviewReadOptions(TURBOFILE_PREVIEW_ORIGINAL_MAX_BYTES + 1, 456);

		assert.deepStrictEqual(options, {
			encoding: 'base64',
			width: TURBOFILE_PREVIEW_LARGE_MAX_DIMENSION,
			height: TURBOFILE_PREVIEW_LARGE_MAX_DIMENSION,
			quality: 92,
			format: 'webp',
			interpolation: 'lanczos',
			maxBytes: 256 * 1024 * 1024,
			sourceSize: TURBOFILE_PREVIEW_ORIGINAL_MAX_BYTES + 1,
			sourceModified: 456
		});
	});
});
