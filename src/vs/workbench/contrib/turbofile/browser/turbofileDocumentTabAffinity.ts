/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorInput } from '../../../common/editor/editorInput.js';
import { IEditorGroup } from '../../../services/editor/common/editorGroupsService.js';
import { TurboFileEditorInput } from '../common/turbofileEditorInput.js';

export function applyTurboFileDocumentTabAffinity(document: EditorInput, source: TurboFileEditorInput): void {
	document.setLabelExtraClasses([
		'turbofile-document-tab',
		`turbofile-tab-color-${source.getTabColorSlot()}`
	]);
}

export function getTurboFileTransferTargetIndex(editors: readonly EditorInput[]): number {
	const firstDocumentIndex = editors.findIndex(editor => !(editor instanceof TurboFileEditorInput));
	return firstDocumentIndex >= 0 ? firstDocumentIndex : editors.length;
}

export function getTurboFileDocumentTargetIndex(editors: readonly EditorInput[]): number {
	return editors.length;
}

export function getTurboFileTabOrder(editors: readonly EditorInput[]): EditorInput[] {
	return [
		...editors.filter(editor => editor instanceof TurboFileEditorInput),
		...editors.filter(editor => !(editor instanceof TurboFileEditorInput))
	];
}

export function ensureTurboFileTransferTabsLeft(group: IEditorGroup): void {
	const orderedEditors = getTurboFileTabOrder(group.editors);
	for (let index = 0; index < orderedEditors.length; index++) {
		if (group.editors[index] !== orderedEditors[index]) {
			group.moveEditor(orderedEditors[index], group, { index });
		}
	}
}
