/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { createTurboFileImagePreviewReadOptions } from '../../common/turbofileImagePreview.js';

suite('TurboFileImagePreview', () => {
	test('preview reads the original image instead of a scaled preview copy', () => {
		const options = createTurboFileImagePreviewReadOptions(123, 456);

		assert.strictEqual(options.encoding, 'base64');
		assert.strictEqual(options.forceOriginal, true);
		assert.strictEqual(options.sourceSize, 123);
		assert.strictEqual(options.sourceModified, 456);
		assert.strictEqual(options.width, undefined);
		assert.strictEqual(options.height, undefined);
		assert.strictEqual(options.format, undefined);
	});
});
