/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { getTurboFileImageGridBaseCardWidth, getTurboFileImageGridCardSize, getTurboFileImageGridEffectiveColumns } from '../../common/turbofileImageGridSizing.js';

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

	test('keeps the legacy 96px card floor for the default 14-column target', () => {
		const cardWidth = Math.max(96, getTurboFileImageGridBaseCardWidth(14, 980, 10));
		assert.deepStrictEqual({
			cardWidth,
			columns: getTurboFileImageGridEffectiveColumns(14, 980, cardWidth, 10)
		}, {
			cardWidth: 96,
			columns: 9
		});
	});

	test('allows explicit Ctrl+wheel zoom-out to reach 24 columns on a full-width surface', () => {
		const cardWidth = Math.max(64, getTurboFileImageGridBaseCardWidth(24, 1980, 10));
		assert.deepStrictEqual({
			cardWidth,
			columns: getTurboFileImageGridEffectiveColumns(24, 1980, cardWidth, 10)
		}, {
			cardWidth: 72,
			columns: 24
		});
	});

	test('reduces a 24-column target automatically when the pane is narrow', () => {
		const cardWidth = Math.max(64, getTurboFileImageGridBaseCardWidth(24, 980, 10));
		assert.strictEqual(getTurboFileImageGridEffectiveColumns(24, 980, cardWidth, 10), 13);
	});
});
