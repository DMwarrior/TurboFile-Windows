/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('TurboFileTabPresentation', () => {
	test('uses native browser-style tab sizing and keeps the title visible', () => {
		const css = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/media/turbofile.css'), 'utf8');

		assert.ok(!css.includes('width: 64px !important;'));
		assert.ok(!css.includes('.tab[data-resource-name^="transfer-"] .label-name,'));
		assert.ok(css.includes('.tab[data-resource-name^="transfer-"] .label-description,'));
	});

	test('colors transfer icons with six VS Code chart theme colors', () => {
		const css = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/media/turbofile.css'), 'utf8');

		assert.deepStrictEqual([
			'blue',
			'green',
			'orange',
			'purple',
			'red',
			'cyan'
		].map(color => css.includes(`var(--vscode-charts-${color})`)), [true, true, true, true, true, true]);
		assert.ok(css.includes('.monaco-icon-label.turbofile-transfer-tab'));
		assert.ok(css.includes('.monaco-icon-label.turbofile-document-tab'));
		assert.ok(css.includes('.monaco-icon-label.turbofile-tab-color-0'));
		assert.ok(css.includes('.tab.active'));
		assert.ok(css.includes('.tab:hover'));
	});

	test('preserves the transfer icon vertical position', () => {
		const css = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/media/turbofile.css'), 'utf8');

		assert.ok(css.includes('transform: translateY(1px);'));
	});

	test('registers resource-scoped context-menu rename and focused-tab F2 handling', () => {
		const contribution = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofile.contribution.ts'), 'utf8');

		assert.ok(contribution.includes("id: 'turbofile.renameTransferTab'"));
		assert.ok(contribution.includes('MenuId.EditorTitleContext'));
		assert.ok(contribution.includes('ResourceContextKey.Scheme.isEqualTo(TurboFileEditorInput.RESOURCE_SCHEME)'));
		assert.ok(contribution.includes('KeyCode.F2'));
		assert.ok(contribution.includes("matches('.tab[data-resource-name^=\"transfer-\"]')"));
	});

	test('suppresses numeric prefixes for transfer pages and their documents', () => {
		const tabs = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/browser/parts/editor/multiEditorTabsControl.ts'), 'utf8');

		assert.deepStrictEqual([
			tabs.includes("labelExtraClasses.includes('turbofile-transfer-tab')"),
			tabs.includes("labelExtraClasses.includes('turbofile-document-tab')"),
			tabs.includes('options.showTabIndex && !suppressTabIndex')
		], [true, true, true]);
	});

	test('applies document affinity and enforces the transfer-page partition', () => {
		const editor = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');
		const contribution = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofile.contribution.ts'), 'utf8');

		assert.deepStrictEqual([
			editor.includes('applyTurboFileDocumentTabAffinity(fileEditor, sourceInput);'),
			editor.includes('getTurboFileDocumentTargetIndex(this.group?.editors ?? [])'),
			editor.includes('ensureTurboFileTransferTabsLeft(pane.group);'),
			contribution.includes('getTurboFileTransferTargetIndex(editors)'),
			contribution.includes('this.editorService.onDidEditorsChange'),
			contribution.includes('ensureTurboFileTransferTabsLeft(group)')
		], [true, true, true, true, true, true]);
		assert.strictEqual(contribution.match(/getTurboFileTransferTargetIndex\(editors\)/g)?.length, 4);
	});
});
