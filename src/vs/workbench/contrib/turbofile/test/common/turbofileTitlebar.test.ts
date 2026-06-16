/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { State, StateType, UpdateType } from '../../../../../platform/update/common/update.js';
import { getTurboFileTitlebarUpdateActionKind } from '../../common/turbofileTitlebar.js';

suite('TurboFileTitlebar', () => {
	test('shows update button only when an update action is available', () => {
		assert.deepStrictEqual([
			getTurboFileTitlebarUpdateActionKind(State.Idle(UpdateType.Setup)),
			getTurboFileTitlebarUpdateActionKind(State.CheckingForUpdates(false)),
			getTurboFileTitlebarUpdateActionKind(State.AvailableForDownload({ version: '1.2.0' })),
			getTurboFileTitlebarUpdateActionKind(State.Downloading({ version: '1.2.0' }, true, false)),
			getTurboFileTitlebarUpdateActionKind(State.Downloaded({ version: '1.2.0' }, true, false)),
			getTurboFileTitlebarUpdateActionKind(State.Updating({ version: '1.2.0' }, true)),
			getTurboFileTitlebarUpdateActionKind(State.Ready({ version: '1.2.0' }, true, false)),
			getTurboFileTitlebarUpdateActionKind({ type: StateType.Uninitialized })
		], [
			'hidden',
			'hidden',
			'download',
			'hidden',
			'install',
			'hidden',
			'restart',
			'hidden'
		]);
	});
});
