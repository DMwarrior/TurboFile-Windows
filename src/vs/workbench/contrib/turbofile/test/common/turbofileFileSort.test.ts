/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { isTurboFileListingReadyForSort, sortTurboFileItems, turboFileSortNeedsAttributes, TurboFileSortDirection, TurboFileSortKey, TurboFileSortableItem } from '../../common/turbofileFileSort.js';

suite('TurboFileFileSort', () => {
	const item = (name: string, options: Partial<TurboFileSortableItem> = {}): TurboFileSortableItem => ({
		name,
		rawSize: 0,
		rawModified: 0,
		type: 'file',
		...options
	});

	const names = (key: TurboFileSortKey, direction: TurboFileSortDirection): string[] => sortTurboFileItems([
		item('zeta.txt', { rawSize: 10, rawModified: 200, type: 'file' }),
		item('alpha.png', { rawSize: 30, rawModified: 100, type: 'file' }),
		item('docs', { directory: true, type: 'directory', rawModified: 300 }),
		item('beta.txt', { rawSize: 20, rawModified: 400, type: 'file' }),
		item('..', { parent: true, type: 'directory' })
	], key, direction).map(entry => entry.name);

	test('keeps parent and folders first while sorting by name', () => {
		assert.deepStrictEqual(names('name', 'ascending'), ['..', 'docs', 'alpha.png', 'beta.txt', 'zeta.txt']);
	});

	test('sorts files by modified time, size, type, and descending direction', () => {
		assert.deepStrictEqual([
			names('modified', 'ascending'),
			names('size', 'descending'),
			names('type', 'ascending')
		], [
			['..', 'docs', 'alpha.png', 'zeta.txt', 'beta.txt'],
			['..', 'docs', 'alpha.png', 'beta.txt', 'zeta.txt'],
			['..', 'docs', 'alpha.png', 'beta.txt', 'zeta.txt']
		]);
	});

	test('sorts every key correctly in both directions before rendering', () => {
		assert.deepStrictEqual([
			names('name', 'descending'),
			names('modified', 'descending'),
			names('size', 'ascending'),
			names('type', 'descending')
		], [
			['..', 'docs', 'zeta.txt', 'beta.txt', 'alpha.png'],
			['..', 'docs', 'beta.txt', 'zeta.txt', 'alpha.png'],
			['..', 'docs', 'zeta.txt', 'beta.txt', 'alpha.png'],
			['..', 'docs', 'beta.txt', 'zeta.txt', 'alpha.png']
		]);
	});

	test('requires complete attributes only for modified-time and size sorting', () => {
		const pending = [item('pending.txt', { attrsPending: true })];

		assert.deepStrictEqual({
			modifiedNeedsAttributes: turboFileSortNeedsAttributes('modified'),
			sizeNeedsAttributes: turboFileSortNeedsAttributes('size'),
			nameNeedsAttributes: turboFileSortNeedsAttributes('name'),
			typeNeedsAttributes: turboFileSortNeedsAttributes('type'),
			modifiedReady: isTurboFileListingReadyForSort(pending, 'modified'),
			sizeReady: isTurboFileListingReadyForSort(pending, 'size'),
			nameReady: isTurboFileListingReadyForSort(pending, 'name'),
			typeReady: isTurboFileListingReadyForSort(pending, 'type')
		}, {
			modifiedNeedsAttributes: true,
			sizeNeedsAttributes: true,
			nameNeedsAttributes: false,
			typeNeedsAttributes: false,
			modifiedReady: false,
			sizeReady: false,
			nameReady: true,
			typeReady: true
		});
	});

	test('applies the same sort key to folders as to files (folders ordered among themselves by the key)', () => {
		// Folders stay grouped ahead of files, but within the folder group they obey the same active
		// sort key/direction as the files do - not a separate name-only rule.
		const ordered = (key: TurboFileSortKey, direction: TurboFileSortDirection): string[] => sortTurboFileItems([
			item('older-big', { directory: true, type: 'directory', rawModified: 100, rawSize: 999 }),
			item('newer-small', { directory: true, type: 'directory', rawModified: 500, rawSize: 1 }),
			item('file-a.txt', { rawModified: 300, rawSize: 50 }),
			item('..', { parent: true, type: 'directory' })
		], key, direction).map(entry => entry.name);

		assert.deepStrictEqual([
			ordered('modified', 'ascending'),
			ordered('modified', 'descending')
		], [
			['..', 'older-big', 'newer-small', 'file-a.txt'],
			['..', 'newer-small', 'older-big', 'file-a.txt']
		]);
	});
});
