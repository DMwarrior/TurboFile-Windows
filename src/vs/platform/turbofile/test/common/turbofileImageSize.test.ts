/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { getTurboFileImageSizeFromHeader } from '../../common/turbofileImageSize.js';

suite('TurboFileImageSize', () => {
	test('reads common image dimensions from headers without decoding the whole image', () => {
		const png = Buffer.from([
			0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
			0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
			0x00, 0x00, 0x08, 0x00,
			0x00, 0x00, 0x05, 0x40
		]);
		const jpeg = Buffer.from([
			0xff, 0xd8,
			0xff, 0xe0, 0x00, 0x04, 0x00, 0x00,
			0xff, 0xc0, 0x00, 0x11, 0x08,
			0x05, 0x40,
			0x08, 0x00
		]);
		const gif = Buffer.from([
			0x47, 0x49, 0x46, 0x38, 0x39, 0x61,
			0x00, 0x08,
			0x40, 0x05
		]);
		const bmp = Buffer.alloc(30);
		bmp.write('BM', 0, 'ascii');
		bmp.writeUInt32LE(40, 14);
		bmp.writeInt32LE(2048, 18);
		bmp.writeInt32LE(-1344, 22);
		const webp = Buffer.from([
			0x52, 0x49, 0x46, 0x46,
			0x18, 0x00, 0x00, 0x00,
			0x57, 0x45, 0x42, 0x50,
			0x56, 0x50, 0x38, 0x20,
			0x0a, 0x00, 0x00, 0x00,
			0x9d, 0x01, 0x2a,
			0xff, 0x07,
			0x3f, 0x05
		]);

		assert.deepStrictEqual(
			[
				getTurboFileImageSizeFromHeader(png),
				getTurboFileImageSizeFromHeader(jpeg),
				getTurboFileImageSizeFromHeader(gif),
				getTurboFileImageSizeFromHeader(bmp),
				getTurboFileImageSizeFromHeader(webp)
			],
			[
				{ width: 2048, height: 1344 },
				{ width: 2048, height: 1344 },
				{ width: 2048, height: 1344 },
				{ width: 2048, height: 1344 },
				{ width: 2048, height: 1344 }
			]
		);
	});
});
