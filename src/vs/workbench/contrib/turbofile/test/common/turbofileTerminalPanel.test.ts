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

	test('disposes only terminals bound to the closed transfer page', () => {
		const editor = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');
		const input = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/common/turbofileEditorInput.ts'), 'utf8');

		assert.ok(input.includes('setCleanupForClose(handler: () => void): void'));
		assert.ok(input.includes('this.cleanupForClose?.();'));
		assert.ok(editor.includes('input.setCleanupForClose(() => this.disposeBoundTerminalsForPage(input.instanceId));'));
		assert.ok(editor.includes('private disposeBoundTerminalsForPage(pageInstanceId: string): void'));
		assert.ok(editor.includes('void this.terminalService.safeDisposeTerminal(instance);'));
		assert.ok(!editor.includes('this.terminalService.safeDisposeTerminal(instance);') || editor.includes('void this.terminalService.safeDisposeTerminal(instance);'));
	});

	test('always renders the taskbar independently from terminal visibility', () => {
		const editor = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');
		const renderTransferPage = editor.slice(
			editor.indexOf('private renderTransferPage(): HTMLElement'),
			editor.indexOf('private registerTransferPageDragAndDrop')
		);

		assert.ok(editor.includes('private isTerminalPanelVisibleForCurrentPage(): boolean'));
		assert.ok(editor.includes('const terminalPanelVisible = this.isTerminalPanelVisibleForCurrentPage();'));
		assert.ok(editor.includes('if (terminalPanelVisible) {'));
		assert.ok(renderTransferPage.includes('page.appendChild(this.renderTaskbar());'));
		assert.ok(!renderTransferPage.includes('shouldRenderTaskbar'));
		assert.ok(!editor.includes('private shouldRenderTaskbar(): boolean'));
	});

	test('creates or refreshes the taskbar without removing it for terminal state', () => {
		const editor = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');
		const refreshTaskbar = editor.slice(
			editor.indexOf('private refreshTaskbar(): void'),
			editor.indexOf('private isTerminalPanelVisibleForCurrentPage(): boolean')
		);

		assert.ok(refreshTaskbar.includes("const transferPage = this.container.querySelector<HTMLElement>('.turbofile-transfer-page');"));
		assert.ok(refreshTaskbar.includes('transferPage?.appendChild(this.renderTaskbar());'));
		assert.ok(refreshTaskbar.includes('current.replaceWith(this.renderTaskbar());'));
		assert.ok(!refreshTaskbar.includes('current?.remove();'));
		assert.ok(!refreshTaskbar.includes('shouldRenderTaskbar'));
	});
});
