/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { createTurboFileImageGridResourceOptions, createTurboFileImagePreviewResourceOptions } from '../../common/turbofileImageResource.js';

suite('TurboFileImageResource', () => {
	test('grid thumbnails request the same webp transform as the web app', () => {
		assert.deepStrictEqual(createTurboFileImageGridResourceOptions(384, 1234, 5678), {
			width: 384,
			quality: 72,
			format: 'webp',
			interpolation: 'lanczos',
			sourceSize: 1234,
			sourceModified: 5678
		});
	});

	test('non-Windows SSH previews request the original image stream', () => {
		assert.deepStrictEqual(createTurboFileImagePreviewResourceOptions(false, { width: 1536, height: 1024, quality: 82 }, 1234, 5678), {
			forceOriginal: true,
			maxBytes: 128 * 1024 * 1024,
			sourceSize: 1234,
			sourceModified: 5678
		});
	});

	test('Windows SSH previews request a display-sized webp transform', () => {
		assert.deepStrictEqual(createTurboFileImagePreviewResourceOptions(true, { width: 1536, height: 1024, quality: 82 }, 1234, 5678), {
			width: 1536,
			height: 1024,
			quality: 82,
			format: 'webp',
			interpolation: 'lanczos',
			maxBytes: 128 * 1024 * 1024,
			sourceSize: 1234,
			sourceModified: 5678
		});
	});
});
