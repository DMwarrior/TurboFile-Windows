/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { getTurboFileImageGridCardSize, getTurboFileImageGridEffectiveColumns } from '../../common/turbofileImageGridSizing.js';

suite('TurboFileImageGridSizing', () => {
	test('scales the image from its original dimensions before sizing the card', () => {
		assert.deepStrictEqual(
			getTurboFileImageGridCardSize({ width: 52, height: 33 }, 4, 96, 58, 16),
			{
				imageWidth: 208,
				imageHeight: 132,
				cardWidth: 224,
				rowHeight: 206
			}
		);
	});

	test('reduces columns from the requested maximum when scaled cards no longer fit', () => {
		assert.strictEqual(
			getTurboFileImageGridEffectiveColumns(12, 1000, 224, 16),
			4
		);
	});
});
