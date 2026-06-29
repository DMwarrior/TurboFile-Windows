/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { StateType } from '../../../../platform/update/common/update.js';

export function getUpdateTitleBarIcon(stateType: StateType): ThemeIcon {
	switch (stateType) {
		case StateType.CheckingForUpdates:
		case StateType.Updating:
		case StateType.Overwriting:
		case StateType.Restarting:
			return Codicon.sync;
		default:
			return Codicon.download;
	}
}
