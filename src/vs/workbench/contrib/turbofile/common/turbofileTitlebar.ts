/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { State, StateType } from '../../../../platform/update/common/update.js';

export type TurboFileTitlebarUpdateActionKind = 'hidden' | 'download' | 'install' | 'restart';

export function getTurboFileTitlebarUpdateActionKind(state: State): TurboFileTitlebarUpdateActionKind {
	switch (state.type) {
		case StateType.AvailableForDownload:
			return 'download';
		case StateType.Downloaded:
			return 'install';
		case StateType.Ready:
			return 'restart';
		default:
			return 'hidden';
	}
}
