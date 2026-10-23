/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IInputOptions } from '../../../../platform/quickinput/common/quickInput.js';
import { IEditorIdentifier } from '../../../common/editor.js';
import { isTurboFileTabTitleTooLong, TURBOFILE_TAB_TITLE_MAX_LENGTH, TurboFileEditorInput } from '../common/turbofileEditorInput.js';

export async function renameTurboFileEditorInput(
	input: TurboFileEditorInput,
	quickInputService: { input(options?: IInputOptions): Promise<string | undefined> }
): Promise<boolean> {
	const currentTitle = input.getName();
	const title = await quickInputService.input({
		title: localize('turbofile.renameTab.title', '重命名标签页'),
		prompt: localize('turbofile.renameTab.prompt', "留空将恢复为“新标签页”"),
		value: currentTitle,
		valueSelection: [0, currentTitle.length],
		validateInput: async value => isTurboFileTabTitleTooLong(value)
			? localize('turbofile.renameTab.tooLong', '标题不能超过 {0} 个字符。', TURBOFILE_TAB_TITLE_MAX_LENGTH)
			: undefined
	});

	if (title === undefined) {
		return false;
	}
	return input.setCustomTitle(title);
}

export function findTurboFileEditorInputForResource(
	editorLookup: { findEditors(resource: URI): readonly IEditorIdentifier[] },
	resource: URI
): TurboFileEditorInput | undefined {
	return editorLookup.findEditors(resource)
		.map(identifier => identifier.editor)
		.find((editor): editor is TurboFileEditorInput => editor instanceof TurboFileEditorInput);
}
