/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('TurboFile Editor Pane Lifecycle', () => {
	test('keeps dynamically registered transfer panes for the workbench lifetime', () => {
		const contributionPath = path.resolve(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofile.contribution.ts');
		const editorPanesPath = path.resolve(process.cwd(), 'src/vs/workbench/browser/parts/editor/editorPanes.ts');
		const editorRegistryPath = path.resolve(process.cwd(), 'src/vs/workbench/browser/editor.ts');
		const editorInputPath = path.resolve(process.cwd(), 'src/vs/workbench/contrib/turbofile/common/turbofileEditorInput.ts');
		const contribution = fs.readFileSync(contributionPath, 'utf8');
		const editorPanes = fs.readFileSync(editorPanesPath, 'utf8');
		const editorRegistry = fs.readFileSync(editorRegistryPath, 'utf8');
		const editorInput = fs.readFileSync(editorInputPath, 'utf8');
		const factoryStart = contribution.indexOf('function createTurboFileTransferEditorInput');
		const factoryEnd = contribution.indexOf('\nfunction getActiveTurboFileEditorInput', factoryStart);
		const factory = contribution.slice(factoryStart, factoryEnd);

		assert.ok(factory.includes('Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane('));
		assert.ok(!factory.includes('const editorPaneRegistration ='));
		assert.ok(!factory.includes('input.setEditorPaneRegistration('));
		assert.ok(!editorPanes.includes('onDidDeregisterEditorPane'));
		assert.ok(!editorPanes.includes('releaseEditorPane('));
		assert.ok(!editorRegistry.includes('onDidDeregisterEditorPane'));
		assert.ok(!editorInput.includes('setEditorPaneRegistration('));
	});

	test('keeps the shared editor-group class until the final transfer pane closes', () => {
		const editorPath = path.resolve(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts');
		const editor = fs.readFileSync(editorPath, 'utf8');
		const createStart = editor.indexOf('protected createEditor(parent: HTMLElement): void');
		const createBlock = editor.slice(createStart, editor.indexOf('private async ensureTurboFileChrome', createStart));
		const disposeStart = editor.indexOf('override dispose(): void');
		const disposeBlock = editor.slice(disposeStart, editor.indexOf('\n\tprivate ', disposeStart));

		assert.ok(editor.includes('const turboFileEditorGroupReferenceCounts = new WeakMap<HTMLElement, number>();'));
		assert.ok(createBlock.includes('this.acquireEditorGroupClassReference();'));
		assert.ok(disposeBlock.includes('this.releaseEditorGroupClassReference();'));
		assert.ok(!disposeBlock.includes("this.editorGroupContainer?.classList.remove('turbofile-main-editor-group')"));
	});

	test('keeps global TurboFile visibility classes owned by every visible page', () => {
		const editorPath = path.resolve(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts');
		const editor = fs.readFileSync(editorPath, 'utf8');
		const disposeStart = editor.indexOf('override dispose(): void');
		const disposeBlock = editor.slice(disposeStart, editor.indexOf('\n\tprivate ', disposeStart));

		assert.ok(editor.includes('const turboFileVisibleEditors = new WeakMap<HTMLElement, Set<TurboFileEditor>>();'));
		assert.ok(editor.includes('private syncGlobalEditorVisibility(): boolean'));
		assert.ok(disposeBlock.includes('this.isEditorVisible = false;'));
		assert.ok(disposeBlock.includes('this.syncGlobalEditorVisibility()'));
		assert.ok(!disposeBlock.includes("document.body.classList.remove('turbofile-main-editor-visible')"));
		assert.ok(!disposeBlock.includes("document.body.classList.remove('turbofile-transfer-tabs-visible')"));
	});
});
