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

	test('shows the taskbar for running tasks while the current page terminal is visible', () => {
		const editor = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');

		assert.ok(editor.includes('private isTerminalPanelVisibleForCurrentPage(): boolean'));
		assert.ok(editor.includes('private shouldRenderTaskbar(): boolean'));
		assert.ok(editor.includes("return !this.isTerminalPanelVisibleForCurrentPage() || this.tasks.some(task => task.status === 'running');"));
		assert.ok(editor.includes('const terminalPanelVisible = this.isTerminalPanelVisibleForCurrentPage();'));
		assert.ok(editor.includes('const shouldRenderTaskbar = this.shouldRenderTaskbar();'));
		assert.ok(editor.includes('if (terminalPanelVisible) {'));
		assert.ok(editor.includes('if (shouldRenderTaskbar) {'));
	});

	test('creates, refreshes, and removes the taskbar as terminal task state changes', () => {
		const editor = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');

		assert.ok(editor.includes('if (!this.shouldRenderTaskbar()) {'));
		assert.ok(editor.includes('current?.remove();'));
		assert.ok(editor.includes("const transferPage = this.container.querySelector<HTMLElement>('.turbofile-transfer-page');"));
		assert.ok(editor.includes('transferPage?.appendChild(this.renderTaskbar());'));
		assert.ok(editor.includes('current.replaceWith(this.renderTaskbar());'));
	});
});
