/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ITurboFileImageGridSortableItem, sortTurboFileImageGridItems, TurboFileImageGridSortKey } from '../../common/turbofileImageGridSort.js';

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

	const names = (items: readonly ITurboFileImageGridSortableItem[], key: TurboFileImageGridSortKey, descending: boolean): string[] =>
		sortTurboFileImageGridItems(items, key, descending).map(entry => entry.name);

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
