/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('TurboFileFileListIcon', () => {
	test('keeps the original theme icon in a stable icon slot for image rows with long names', () => {
		const css = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/media/turbofile.css'), 'utf8');
		const editor = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');
		const start = editor.indexOf('private renderFileBrowserIcon');
		const end = editor.indexOf('private getDeviceDisplayLabel', start);
		const renderFileBrowserIcon = editor.slice(start, end);

		assert.ok(renderFileBrowserIcon.includes("span.turbofile-file-icon-slot.turbofile-file-theme-icon-slot"));
		assert.ok(renderFileBrowserIcon.includes('getIconClasses(this.modelService, this.languageService, resource, FileKind.FILE)'));
		assert.ok(!renderFileBrowserIcon.includes("if (isImageFile(item.name))"));
		assert.ok(!renderFileBrowserIcon.includes('Codicon.fileMedia'));
		assert.ok(css.includes('.turbofile-file-icon-slot'));
		assert.ok(css.includes('flex: 0 0 18px;'));
		assert.ok(css.includes('.turbofile-file-icon-slot .monaco-icon-label'));
	});
});
