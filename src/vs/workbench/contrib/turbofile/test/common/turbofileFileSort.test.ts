/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { sortTurboFileItems, TurboFileSortDirection, TurboFileSortKey, TurboFileSortableItem } from '../../common/turbofileFileSort.js';

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
});
