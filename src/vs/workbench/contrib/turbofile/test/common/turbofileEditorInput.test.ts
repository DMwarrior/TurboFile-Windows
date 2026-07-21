/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestDialogService } from '../../../../../platform/dialogs/test/common/testDialogService.js';
import { TurboFileEditorInput } from '../../common/turbofileEditorInput.js';

suite('TurboFileEditorInput', () => {
	const disposables = new DisposableStore();

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	function createInput(ordinal = 1): TurboFileEditorInput {
		return disposables.add(new TurboFileEditorInput(`transfer-${ordinal}`, ordinal, TurboFileEditorInput.EDITOR_ID, new TestDialogService()));
	}

	test('uses the localized new-tab title by default', () => {
		const input = createInput();

		assert.deepStrictEqual([input.getName(), input.getTitle()], ['新标签页', '新标签页']);
	});

	test('sets, trims, and resets a custom title while firing label changes', () => {
		const input = createInput();
		let labelChangeCount = 0;
		disposables.add(input.onDidChangeLabel(() => labelChangeCount++));

		assert.strictEqual(input.setCustomTitle('  客户服务器  '), true);
		assert.deepStrictEqual([input.getName(), labelChangeCount], ['客户服务器', 1]);
		assert.strictEqual(input.setCustomTitle('   '), true);
		assert.deepStrictEqual([input.getName(), labelChangeCount], ['新标签页', 2]);
	});

	test('rejects titles longer than 40 characters without changing the label', () => {
		const input = createInput();
		let labelChangeCount = 0;
		disposables.add(input.onDidChangeLabel(() => labelChangeCount++));

		assert.strictEqual(input.setCustomTitle('a'.repeat(41)), false);
		assert.deepStrictEqual([input.getName(), labelChangeCount], ['新标签页', 0]);
	});

	test('keeps the remote explorer icon and assigns stable cyclic color classes', () => {
		const inputs = Array.from({ length: 8 }, (_, index) => createInput(index + 1));

		assert.strictEqual(inputs[0].getIcon(), Codicon.remoteExplorer);
		assert.deepStrictEqual(inputs.map(input => input.getLabelExtraClasses()), [
			['turbofile-transfer-tab', 'turbofile-tab-color-0'],
			['turbofile-transfer-tab', 'turbofile-tab-color-1'],
			['turbofile-transfer-tab', 'turbofile-tab-color-2'],
			['turbofile-transfer-tab', 'turbofile-tab-color-3'],
			['turbofile-transfer-tab', 'turbofile-tab-color-4'],
			['turbofile-transfer-tab', 'turbofile-tab-color-5'],
			['turbofile-transfer-tab', 'turbofile-tab-color-0'],
			['turbofile-transfer-tab', 'turbofile-tab-color-1']
		]);
		assert.deepStrictEqual(inputs.map(input => input.getTabColorSlot()), [0, 1, 2, 3, 4, 5, 0, 1]);
	});

	test('keeps copy and cut modes independent by pane and page', () => {
		const first = createInput(1);
		const second = createInput(2);

		assert.deepStrictEqual([
			first.getDragOperation('left'), first.getDragOperation('right'),
			second.getDragOperation('left'), second.getDragOperation('right')
		], ['copy', 'copy', 'copy', 'copy']);
		assert.strictEqual(first.toggleDragOperation('left'), 'move');
		assert.deepStrictEqual([
			first.getDragOperation('left'), first.getDragOperation('right'), second.getDragOperation('left')
		], ['move', 'copy', 'copy']);
	});

});
