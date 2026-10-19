/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfirmResult } from '../../../../../platform/dialogs/common/dialogs.js';
import { TestDialogService } from '../../../../../platform/dialogs/test/common/testDialogService.js';
import { TurboFileEditorInput } from '../../common/turbofileEditorInput.js';

class RecordingDialogService extends TestDialogService {
	readonly errors: Array<{ message: string; detail: string | undefined }> = [];

	override async error(message: string, detail?: string): Promise<void> {
		this.errors.push({ message, detail });
	}
}

suite('TurboFileEditorInput', () => {
	const disposables = new DisposableStore();

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	function createInput(ordinal = 1, dialogService = new TestDialogService()): TurboFileEditorInput {
		return disposables.add(new TurboFileEditorInput(`transfer-${ordinal}`, ordinal, TurboFileEditorInput.EDITOR_ID, dialogService));
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

	test('keeps a page open after cancellation fails, shows the cause and allows retry', async () => {
		const dialogs = new RecordingDialogService({ confirmed: true });
		const input = createInput(1, dialogs);
		input.setRunningTaskCount(1);
		let attempts = 0;
		input.setCancelRunningTasksForClose(async () => {
			if (++attempts === 1) {
				throw new Error('SSH channel still running');
			}
		});
		const firstResult = await input.confirm([{ editor: input, groupId: 1 }]);
		assert.deepStrictEqual({ result: firstResult, stillRunning: input.showConfirm(), errors: dialogs.errors.map(error => error.detail) }, { result: ConfirmResult.CANCEL, stillRunning: true, errors: ['SSH channel still running'] });
		const secondResult = await input.confirm([{ editor: input, groupId: 1 }]);
		assert.deepStrictEqual({ result: secondResult, stillRunning: input.showConfirm(), attempts }, { result: ConfirmResult.DONT_SAVE, stillRunning: false, attempts: 2 });
	});

	test('canceling several pages keeps failed pages accountable while successful pages stop', async () => {
		const dialogs = new RecordingDialogService({ confirmed: true });
		const first = createInput(1, dialogs);
		const second = createInput(2, dialogs);
		first.setRunningTaskCount(1);
		second.setRunningTaskCount(1);
		const canceled: number[] = [];
		first.setCancelRunningTasksForClose(async () => { canceled.push(1); });
		second.setCancelRunningTasksForClose(async () => { canceled.push(2); throw new Error('IPC disconnected'); });
		const result = await first.confirm([{ editor: first, groupId: 1 }, { editor: second, groupId: 1 }]);
		assert.deepStrictEqual({ result, canceled, running: [first.showConfirm(), second.showConfirm()], errors: dialogs.errors.map(error => error.detail) }, { result: ConfirmResult.CANCEL, canceled: [1, 2], running: [false, true], errors: ['IPC disconnected'] });
	});

});
