/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { createTurboFileImagePreviewReadOptions } from '../../common/turbofileImagePreview.js';

suite('TurboFileImagePreview', () => {
	test('preview reads the original image through a binary result when possible', () => {
		const options = createTurboFileImagePreviewReadOptions(123, 456);

		assert.deepStrictEqual(
			{
				encoding: options.encoding,
				forceOriginal: options.forceOriginal,
				preferBuffer: (options as { readonly preferBuffer?: boolean }).preferBuffer,
				sourceSize: options.sourceSize,
				sourceModified: options.sourceModified,
				width: options.width,
				height: options.height,
				format: options.format
			},
			{
				encoding: 'base64',
				forceOriginal: true,
				preferBuffer: true,
				sourceSize: 123,
				sourceModified: 456,
				width: undefined,
				height: undefined,
				format: undefined
			}
		);
	});
});
