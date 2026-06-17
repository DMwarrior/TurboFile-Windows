/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { getTurboFileImageGridCardSize, getTurboFileImageGridEffectiveColumns, shouldUseOriginalTurboFileImageGridSource } from '../../common/turbofileImageGridSizing.js';

suite('TurboFileImageGridSizing', () => {
	test('keeps the old 1x grid size for large images', () => {
		assert.deepStrictEqual(
			getTurboFileImageGridCardSize({ width: 2048, height: 1344 }, 1, 220, 150, 58, 16),
			{
				imageWidth: 204,
				imageHeight: 134,
				cardWidth: 220,
				rowHeight: 208
			}
		);
	});

	test('scales from the old 1x displayed image size', () => {
		assert.deepStrictEqual(
			[
				getTurboFileImageGridCardSize({ width: 52, height: 33 }, 2, 220, 150, 58, 16),
				getTurboFileImageGridCardSize({ width: 52, height: 33 }, 4, 220, 150, 58, 16)
			],
			[
				{
					imageWidth: 104,
					imageHeight: 66,
					cardWidth: 220,
					rowHeight: 208
				},
				{
					imageWidth: 208,
					imageHeight: 132,
					cardWidth: 224,
					rowHeight: 208
				}
			]
		);
	});

	test('keeps 12 columns at 1x and reduces columns when scaled cards no longer fit', () => {
		assert.deepStrictEqual(
			[
				getTurboFileImageGridEffectiveColumns(12, 2816, 220, 16),
				getTurboFileImageGridEffectiveColumns(12, 2816, 424, 16)
			],
			[12, 6]
		);
	});

	test('does not treat a small thumbnail as a small original image', () => {
		assert.deepStrictEqual(
			[
				shouldUseOriginalTurboFileImageGridSource(96, 64, undefined, undefined, 100),
				shouldUseOriginalTurboFileImageGridSource(96, 64, 2048, 1344, 100),
				shouldUseOriginalTurboFileImageGridSource(96, 64, 96, 64, 100)
			],
			[false, false, true]
		);
	});
});
