/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('TurboFileDirectoryNavigation', () => {
	const editorPath = () => path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts');
	const readEditor = () => fs.readFileSync(editorPath(), 'utf8');
	const methodBlock = (source: string, start: string, end: string): string => {
		const startIndex = source.indexOf(start);
		const endIndex = source.indexOf(end, startIndex);
		assert.ok(startIndex >= 0, `${start} should exist`);
		assert.ok(endIndex > startIndex, `${end} should follow ${start}`);
		return source.slice(startIndex, endIndex);
	};

	test('ordinary path opens use optimistic navigation instead of force refresh', () => {
		const source = readEditor();
		const block = methodBlock(source, 'private async openPanePath', 'private async navigatePaneDirectory');

		assert.ok(block.includes('this.navigatePaneDirectory(side, path)'));
		assert.ok(!block.includes('force: true'));
		assert.ok(!block.includes('refreshPane(side'));
	});

	test('directory navigation keeps existing rows stable while fetching uncached paths', () => {
		const source = readEditor();
		const block = methodBlock(source, 'private async navigatePaneDirectory', 'private renderFileList');

		assert.ok(block.includes('this.render();'));
		assert.ok(!block.includes('state.items = [];'));
		assert.ok(!block.includes('NAV_LOADING_PLACEHOLDER_DELAY_MS'));
	});

	test('file list does not render the blocking directory loading placeholder', () => {
		const source = readEditor();
		const loadingText = String.fromCharCode(27491, 22312, 21152, 36733, 30446, 24405);

		assert.ok(!source.includes(loadingText));
		assert.ok(!source.includes('NAV_LOADING_PLACEHOLDER_DELAY_MS'));
	});
});
