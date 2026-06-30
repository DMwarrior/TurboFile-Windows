/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { State, StateType, UpdateType } from '../../../../../platform/update/common/update.js';
import { getTurboFileTitlebarUpdateActionKind } from '../../common/turbofileTitlebar.js';

suite('TurboFileTitlebar', () => {
	test('shows update button only when an update action is available', () => {
		assert.deepStrictEqual([
			getTurboFileTitlebarUpdateActionKind(State.Idle(UpdateType.Setup)),
			getTurboFileTitlebarUpdateActionKind(State.CheckingForUpdates(false)),
			getTurboFileTitlebarUpdateActionKind(State.AvailableForDownload({ version: '1.2.0' })),
			getTurboFileTitlebarUpdateActionKind(State.Downloading({ version: '1.2.0' }, true, false, 50, 100)),
			getTurboFileTitlebarUpdateActionKind(State.Downloaded({ version: '1.2.0' }, true, false)),
			getTurboFileTitlebarUpdateActionKind(State.Updating({ version: '1.2.0' }, true)),
			getTurboFileTitlebarUpdateActionKind(State.Ready({ version: '1.2.0' }, true, false)),
			getTurboFileTitlebarUpdateActionKind({ type: StateType.Uninitialized })
		], [
			'hidden',
			'checking',
			'download',
			'downloading',
			'install',
			'installing',
			'restart',
			'hidden'
		]);
	});

	test('keeps the TurboFile update button compact in the custom titlebar', () => {
		const css = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/media/turbofile.css'), 'utf8');

		assert.ok(css.includes('width: 20px;'));
		assert.ok(css.includes('min-width: 20px;'));
		assert.ok(css.includes('height: 20px;'));
		assert.ok(css.includes('font-size: 12px;'));
		assert.ok(css.includes('min-width: 34px;'));
	});

	test('uses a short TurboFile update check interval while the app stays open', () => {
		const product = fs.readFileSync(path.join(process.cwd(), 'product.json'), 'utf8');
		const updateService = fs.readFileSync(path.join(process.cwd(), 'src/vs/platform/update/electron-main/abstractUpdateService.ts'), 'utf8');

		assert.ok(product.includes('"checkIntervalMs": 60000'));
		assert.ok(product.includes('"initialCheckDelayMs": 10000'));
		assert.ok(updateService.includes('getAutomaticUpdateCheckIntervalMs()'));
		assert.ok(updateService.includes('getAutomaticUpdateInitialDelayMs()'));
	});
});
