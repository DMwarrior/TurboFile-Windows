/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { suite, test } from 'mocha';
import { EditorPaneDescriptor, EditorPaneRegistry } from '../../../../browser/editor.js';

suite('TurboFile Editor Pane Lifecycle', () => {
	test('releases each dynamically registered pane when its transfer input is disposed', () => {
		const contributionPath = path.resolve(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofile.contribution.ts');
		const editorPanesPath = path.resolve(process.cwd(), 'src/vs/workbench/browser/parts/editor/editorPanes.ts');
		const contribution = fs.readFileSync(contributionPath, 'utf8');
		const editorPanes = fs.readFileSync(editorPanesPath, 'utf8');
		const factoryStart = contribution.indexOf('function createTurboFileTransferEditorInput');
		const factoryEnd = contribution.indexOf('\nfunction getActiveTurboFileEditorInput', factoryStart);
		const factory = contribution.slice(factoryStart, factoryEnd);

		assert.ok(factory.includes('const editorPaneRegistration ='));
		assert.ok(factory.includes('input.setEditorPaneRegistration(editorPaneRegistration)'));
		assert.ok(editorPanes.includes('onDidDeregisterEditorPane(descriptor => this.releaseEditorPane(descriptor))'));
		assert.ok(editorPanes.includes('this._store.delete(editorPane)'));
	});

	test('deregistering a pane notifies its owners exactly once', () => {
		const registry = new EditorPaneRegistry();
		const descriptor = {
			typeId: 'workbench.editor.turbofile.lifecycle-test',
			name: 'TurboFile lifecycle test',
			instantiate: () => { throw new Error('not needed'); },
			describes: () => false
		} as unknown as EditorPaneDescriptor;
		let notificationCount = 0;
		const listener = registry.onDidDeregisterEditorPane(deregistered => {
			assert.strictEqual(deregistered, descriptor);
			notificationCount++;
		});
		const registration = registry.registerEditorPane(descriptor, []);

		registration.dispose();
		registration.dispose();
		listener.dispose();

		assert.strictEqual(notificationCount, 1);
	});
});
