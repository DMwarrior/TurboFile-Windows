/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ITurboFileImageGridSortableItem, sortTurboFileImageGridItems, TurboFileImageGridSizeSortBasis, TurboFileImageGridSortKey } from '../../common/turbofileImageGridSort.js';

suite('TurboFileImageGridSort', () => {
	interface TestSortableItem extends ITurboFileImageGridSortableItem {
		readonly rawSize: number;
		readonly sizeKnown: boolean;
		readonly originalWidth: number;
		readonly originalHeight: number;
		readonly dimensionsKnown: boolean;
	}

	const item = (name: string, options: Partial<TestSortableItem> = {}): TestSortableItem => ({
		name,
		modified: 0,
		modifiedKnown: false,
		rawSize: 0,
		sizeKnown: false,
		originalWidth: 0,
		originalHeight: 0,
		dimensionsKnown: false,
		...options
	});

	const names = (items: readonly ITurboFileImageGridSortableItem[], key: TurboFileImageGridSortKey, descending: boolean, sizeSortBasis: TurboFileImageGridSizeSortBasis = 'file'): string[] =>
		sortTurboFileImageGridItems(items, key, descending, sizeSortBasis).map(entry => entry.name);

	test('sorts known modified times and keeps unknown values last in both directions', () => {
		const items = [
			item('unknown.jpg'),
			item('epoch.jpg', { modified: 0, modifiedKnown: true }),
			item('old.jpg', { modified: 100, modifiedKnown: true }),
			item('new.jpg', { modified: 300, modifiedKnown: true })
		];

		assert.deepStrictEqual(names(items, 'date', false), ['epoch.jpg', 'old.jpg', 'new.jpg', 'unknown.jpg']);
		assert.deepStrictEqual(names(items, 'date', true), ['new.jpg', 'old.jpg', 'epoch.jpg', 'unknown.jpg']);
	});

	test('sorts by file byte size and keeps unknown values last in both directions', () => {
		const items = [
			item('unknown.jpg', { rawSize: 9000, originalWidth: 1, originalHeight: 1, dimensionsKnown: true }),
			item('large.jpg', { rawSize: 12000, sizeKnown: true, originalWidth: 2, originalHeight: 2, dimensionsKnown: true }),
			item('small.jpg', { rawSize: 480, sizeKnown: true, originalWidth: 4000, originalHeight: 3000, dimensionsKnown: true })
		];

		assert.deepStrictEqual(names(items, 'size', false), ['small.jpg', 'large.jpg', 'unknown.jpg']);
		assert.deepStrictEqual(names(items, 'size', true), ['large.jpg', 'small.jpg', 'unknown.jpg']);
	});

	test('sorts size by original pixel count when image dimensions are selected', () => {
		const items = [
			item('unknown.jpg', { rawSize: 50000, sizeKnown: true }),
			item('wide.jpg', { rawSize: 100, sizeKnown: true, originalWidth: 4000, originalHeight: 1000, dimensionsKnown: true }),
			item('large.jpg', { rawSize: 200, sizeKnown: true, originalWidth: 3000, originalHeight: 2000, dimensionsKnown: true }),
			item('small.jpg', { rawSize: 90000, sizeKnown: true, originalWidth: 800, originalHeight: 600, dimensionsKnown: true })
		];

		assert.deepStrictEqual(names(items, 'size', false, 'dimensions'), ['small.jpg', 'wide.jpg', 'large.jpg', 'unknown.jpg']);
		assert.deepStrictEqual(names(items, 'size', true, 'dimensions'), ['large.jpg', 'wide.jpg', 'small.jpg', 'unknown.jpg']);
	});

	test('breaks equal pixel-count ties by width, height and then natural name', () => {
		const items = [
			item('square10.jpg', { originalWidth: 1000, originalHeight: 1000, dimensionsKnown: true }),
			item('wide.jpg', { originalWidth: 2000, originalHeight: 500, dimensionsKnown: true }),
			item('square2.jpg', { originalWidth: 1000, originalHeight: 1000, dimensionsKnown: true })
		];

		assert.deepStrictEqual(names(items, 'size', false, 'dimensions'), ['square2.jpg', 'square10.jpg', 'wide.jpg']);
		assert.deepStrictEqual(names(items, 'size', true, 'dimensions'), ['wide.jpg', 'square2.jpg', 'square10.jpg']);
	});

	test('uses natural names and case-insensitive extensions', () => {
		const items = [item('image10.PNG'), item('image2.jpg'), item('image1.JPEG')];

		assert.deepStrictEqual(names(items, 'name', false), ['image1.JPEG', 'image2.jpg', 'image10.PNG']);
		assert.deepStrictEqual(names(items, 'name', true), ['image10.PNG', 'image2.jpg', 'image1.JPEG']);
		assert.deepStrictEqual(names(items, 'type', false), ['image1.JPEG', 'image2.jpg', 'image10.PNG']);
		assert.deepStrictEqual(names([item('a.gif'), item('b.PNG'), item('c.jpg')], 'type', true), ['b.PNG', 'c.jpg', 'a.gif']);
	});

	test('uses deterministic names when date or size values tie', () => {
		const items = [
			item('b.jpg', { modified: 100, modifiedKnown: true, rawSize: 200, sizeKnown: true }),
			item('a.jpg', { modified: 100, modifiedKnown: true, rawSize: 200, sizeKnown: true })
		];

		assert.deepStrictEqual(names(items, 'date', false), ['a.jpg', 'b.jpg']);
		assert.deepStrictEqual(names(items, 'size', false), ['a.jpg', 'b.jpg']);
	});
});
