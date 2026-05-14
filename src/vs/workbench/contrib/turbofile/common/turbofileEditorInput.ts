/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { URI } from '../../../../base/common/uri.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { EditorInputCapabilities, IUntypedEditorInput, Verbosity } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';

export class TurboFileEditorInput extends EditorInput {
	static readonly ID = 'workbench.input.turbofile';
	static readonly EDITOR_ID = 'workbench.editor.turbofile';
	static readonly RESOURCE = URI.from({ scheme: 'turbofile', path: '/home' });

	constructor() {
		super();
	}

	override get typeId(): string {
		return TurboFileEditorInput.ID;
	}

	override get editorId(): string {
		return TurboFileEditorInput.EDITOR_ID;
	}

	override get resource(): URI {
		return TurboFileEditorInput.RESOURCE;
	}

	override get capabilities(): EditorInputCapabilities {
		return EditorInputCapabilities.Readonly | EditorInputCapabilities.Singleton | EditorInputCapabilities.ForceReveal;
	}

	override getName(): string {
		return '极速传';
	}

	override getTitle(_verbosity?: Verbosity): string {
		return '极速传';
	}

	override getDescription(_verbosity?: Verbosity): string {
		return 'Windows Native Fast Transfer';
	}

	override getIcon(): ThemeIcon {
		return Codicon.remoteExplorer;
	}

	override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
		return otherInput instanceof TurboFileEditorInput;
	}
}
