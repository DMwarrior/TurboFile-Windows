/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('TurboFileTerminalPanel', () => {
	test('guards programmatic terminal panel visibility changes across editor instances', () => {
		const editor = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');

		assert.ok(editor.includes('let turboFileTerminalPanelVisibilityChangeDepth = 0;'));
		assert.ok(editor.includes('function isTurboFileTerminalPanelVisibilityInProgress(): boolean'));
		assert.ok(editor.includes('!isTurboFileTerminalPanelVisibilityInProgress()'));
		assert.ok(!editor.includes('private terminalPanelVisibilityInProgress = false;'));
		assert.ok(!editor.includes('private terminalPanelVisibilityChangeDepth = 0;'));
	});

	test('only the active transfer editor remembers user-hidden terminal panels', () => {
		const editor = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');

		assert.ok(editor.includes('private isCurrentTransferEditorActive(): boolean'));
		assert.ok(editor.includes('if (!this.isCurrentTransferEditorActive())'));
		assert.ok(editor.includes('this.editorService.activeEditor === this.currentInput'));
	});
});
