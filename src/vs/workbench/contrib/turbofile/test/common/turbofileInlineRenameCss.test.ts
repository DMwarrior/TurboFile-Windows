/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('TurboFileInlineRenameCss', () => {
	test('uses a contenteditable inline rename editor so selected underscores remain visible', () => {
		const css = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/media/turbofile.css'), 'utf8');
		const editor = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');

		assert.ok(css.includes('--turbofile-inline-rename-height: max(36px, calc(var(--turbofile-browser-font-size, 14px) + 22px));'));
		assert.ok(css.includes('.turbofile-inline-rename-editor'));
		assert.ok(css.includes('white-space: pre;'));
		assert.ok(css.includes('user-select: text;'));
		// Centering via a content-box-height line-height keeps descenders (underscore/g/y) visible.
		assert.ok(css.includes('line-height: calc(var(--turbofile-inline-rename-height) - 2px);'));
		assert.ok(editor.includes("$('.turbofile-inline-rename-editor')"));
		assert.ok(editor.includes("editor.contentEditable = 'plaintext-only';"));
		assert.ok(!editor.includes('const inputBox = new InputBox(inputHost'));
		assert.ok(!css.includes('line-height: 18px !important;'));
	});
});
