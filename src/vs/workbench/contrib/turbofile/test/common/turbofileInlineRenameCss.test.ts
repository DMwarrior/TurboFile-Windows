/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('TurboFileInlineRenameCss', () => {
	test('keeps underscore glyphs visible for inline rename input text', () => {
		const css = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/media/turbofile.css'), 'utf8');

		assert.ok(css.includes('height: max(30px, calc(var(--turbofile-browser-font-size, 14px) + 16px));'));
		assert.ok(css.includes('line-height: calc(var(--turbofile-browser-font-size, 14px) + 16px) !important;'));
		assert.ok(css.includes('padding: 0 6px !important;'));
		assert.ok(!css.includes('line-height: 18px !important;'));
	});
});
