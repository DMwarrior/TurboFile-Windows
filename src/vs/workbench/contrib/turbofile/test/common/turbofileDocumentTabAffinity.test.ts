/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestDialogService } from '../../../../../platform/dialogs/test/common/testDialogService.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { applyTurboFileDocumentTabAffinity, getTurboFileDocumentTargetIndex, getTurboFileTabOrder, getTurboFileTransferTargetIndex } from '../../browser/turbofileDocumentTabAffinity.js';
import { TurboFileEditorInput } from '../../common/turbofileEditorInput.js';

suite('TurboFileDocumentTabAffinity', () => {
	const disposables = new DisposableStore();

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	class TestDocumentEditorInput extends EditorInput {
		override readonly resource: URI;

		constructor(resource = URI.file('document.txt')) {
			super();
			this.resource = resource;
		}

		override get typeId(): string {
			return 'test.document';
		}
	}

	function createTransferInput(ordinal: number): TurboFileEditorInput {
		return disposables.add(new TurboFileEditorInput(`transfer-${ordinal}`, ordinal, TurboFileEditorInput.EDITOR_ID, new TestDialogService()));
	}

	test('updates transient editor label classes only when the classes change', () => {
		const input = disposables.add(new TestDocumentEditorInput());
		let labelChangeCount = 0;
		disposables.add(input.onDidChangeLabel(() => labelChangeCount++));

		input.setLabelExtraClasses(['turbofile-document-tab', 'turbofile-tab-color-2']);
		input.setLabelExtraClasses(['turbofile-document-tab', 'turbofile-tab-color-2']);
		const returnedClasses = input.getLabelExtraClasses();
		returnedClasses.length = 0;

		assert.deepStrictEqual([input.getLabelExtraClasses(), labelChangeCount], [[
			'turbofile-document-tab',
			'turbofile-tab-color-2'
		], 1]);
	});

	test('uses the most recently opened transfer page color for a document', () => {
		const document = disposables.add(new TestDocumentEditorInput());
		const firstSource = createTransferInput(2);
		const secondSource = createTransferInput(7);

		applyTurboFileDocumentTabAffinity(document, firstSource);
		const firstClasses = document.getLabelExtraClasses();
		applyTurboFileDocumentTabAffinity(document, secondSource);

		assert.deepStrictEqual([firstClasses, document.getLabelExtraClasses()], [[
			'turbofile-document-tab',
			'turbofile-tab-color-1'
		], [
			'turbofile-document-tab',
			'turbofile-tab-color-0'
		]]);
	});

	test('inserts transfer pages before documents and documents at the right edge', () => {
		const firstPage = createTransferInput(1);
		const secondPage = createTransferInput(2);
		const firstDocument = disposables.add(new TestDocumentEditorInput());
		const secondDocument = disposables.add(new TestDocumentEditorInput(URI.file('second.txt')));

		assert.deepStrictEqual([
			getTurboFileTransferTargetIndex([firstPage, firstDocument, secondDocument]),
			getTurboFileTransferTargetIndex([firstPage, secondPage]),
			getTurboFileDocumentTargetIndex([firstPage, secondPage, firstDocument])
		], [1, 2, 3]);
	});

	test('stably partitions transfer pages before documents', () => {
		const firstPage = createTransferInput(1);
		const secondPage = createTransferInput(2);
		const firstDocument = disposables.add(new TestDocumentEditorInput());
		const secondDocument = disposables.add(new TestDocumentEditorInput(URI.file('second.txt')));

		assert.deepStrictEqual(
			getTurboFileTabOrder([firstDocument, firstPage, secondDocument, secondPage]),
			[firstPage, secondPage, firstDocument, secondDocument]
		);
	});
});
