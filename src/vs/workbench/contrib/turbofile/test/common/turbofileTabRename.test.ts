/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestDialogService } from '../../../../../platform/dialogs/test/common/testDialogService.js';
import { IInputOptions } from '../../../../../platform/quickinput/common/quickInput.js';
import { IEditorIdentifier } from '../../../../common/editor.js';
import { findTurboFileEditorInputForResource, renameTurboFileEditorInput } from '../../browser/turbofileTabRename.js';
import { TurboFileEditorInput } from '../../common/turbofileEditorInput.js';

suite('TurboFileTabRename', () => {
	const disposables = new DisposableStore();

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	function createInput(instanceId: string, ordinal = 1): TurboFileEditorInput {
		return disposables.add(new TurboFileEditorInput(instanceId, ordinal, TurboFileEditorInput.EDITOR_ID, new TestDialogService()));
	}

	function createQuickInputService(result: string | undefined, onInput?: (options: IInputOptions | undefined) => Promise<void>): { input(options?: IInputOptions): Promise<string | undefined> } {
		return {
			async input(options?: IInputOptions): Promise<string | undefined> {
				await onInput?.(options);
				return result;
			}
		};
	}

	test('cancelling the rename leaves the title unchanged', async () => {
		const input = createInput('first');

		assert.strictEqual(await renameTurboFileEditorInput(input, createQuickInputService(undefined)), false);
		assert.strictEqual(input.getName(), '新标签页');
	});

	test('prefills and applies a valid title', async () => {
		const input = createInput('first');
		let prefilledValue: string | undefined;

		assert.strictEqual(await renameTurboFileEditorInput(input, createQuickInputService('  生产服务器  ', async options => {
			prefilledValue = options?.value;
		})), true);
		assert.deepStrictEqual([prefilledValue, input.getName()], ['新标签页', '生产服务器']);
	});

	test('empty input restores the default title', async () => {
		const input = createInput('first');
		input.setCustomTitle('临时标题');

		assert.strictEqual(await renameTurboFileEditorInput(input, createQuickInputService('  ')), true);
		assert.strictEqual(input.getName(), '新标签页');
	});

	test('rejects input longer than 40 characters with a validation message', async () => {
		const input = createInput('first');
		const longTitle = 'a'.repeat(41);
		let validationMessage: string | null | undefined;

		assert.strictEqual(await renameTurboFileEditorInput(input, createQuickInputService(longTitle, async options => {
			const validation = await options?.validateInput?.(longTitle);
			validationMessage = typeof validation === 'string' || validation === null || validation === undefined ? validation : validation.content;
		})), false);
		assert.strictEqual(typeof validationMessage, 'string');
		assert.strictEqual(input.getName(), '新标签页');
	});

	test('locates the exact tab passed by the editor context menu resource', () => {
		const first = createInput('first', 1);
		const second = createInput('second', 2);
		const editorLookup = {
			findEditors(resource: URI): readonly IEditorIdentifier[] {
				return resource.toString() === second.resource.toString() ? [{ editor: second, groupId: 1 }] : [{ editor: first, groupId: 1 }];
			}
		};

		assert.strictEqual(findTurboFileEditorInputForResource(editorLookup, second.resource), second);
	});
});
