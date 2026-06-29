/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { StateType } from '../../../../../platform/update/common/update.js';
import { getUpdateTitleBarIcon } from '../../common/updateTitleBarPresentation.js';

suite('Update Title Bar Presentation', () => {
	test('uses Codex-style download icon for actionable update states', () => {
		assert.deepStrictEqual([
			getUpdateTitleBarIcon(StateType.AvailableForDownload).id,
			getUpdateTitleBarIcon(StateType.Downloaded).id,
			getUpdateTitleBarIcon(StateType.Ready).id,
		], [Codicon.download.id, Codicon.download.id, Codicon.download.id]);
	});

	test('uses sync icon for in-progress update states', () => {
		assert.deepStrictEqual([
			getUpdateTitleBarIcon(StateType.CheckingForUpdates).id,
			getUpdateTitleBarIcon(StateType.Updating).id,
			getUpdateTitleBarIcon(StateType.Overwriting).id,
			getUpdateTitleBarIcon(StateType.Restarting).id,
		], [Codicon.sync.id, Codicon.sync.id, Codicon.sync.id, Codicon.sync.id]);
	});
});
