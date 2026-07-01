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
			'hidden',
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

		assert.ok(css.includes('height: 20px;'));
		assert.ok(css.includes('min-width: 42px;'));
		assert.ok(css.includes('padding: 0 9px;'));
		assert.ok(css.includes('font-size: 12px;'));
	});

	test('places the TurboFile update button after Help and labels it with the target version', () => {
		const editor = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');
		const helpMenuIndex = editor.indexOf("this.createTitlebarMenuButton('帮助'");
		const updateButtonIndex = editor.indexOf('this.createTitlebarUpdateButton(updateActionKind)', helpMenuIndex);

		assert.ok(helpMenuIndex >= 0);
		assert.ok(updateButtonIndex > helpMenuIndex);
		assert.ok(editor.includes('private getTitlebarUpdateVersionLabel(): string'));
		assert.ok(editor.includes("return version ? `更新 ${version}` : '更新';"));
	});

	test('uses a short TurboFile update check interval while the app stays open', () => {
		const product = fs.readFileSync(path.join(process.cwd(), 'product.json'), 'utf8');
		const updateService = fs.readFileSync(path.join(process.cwd(), 'src/vs/platform/update/electron-main/abstractUpdateService.ts'), 'utf8');

		assert.ok(product.includes('"checkIntervalMs": 60000'));
		assert.ok(product.includes('"initialCheckDelayMs": 10000'));
		assert.ok(product.includes('"win32VersionedUpdate": true'));
		assert.ok(updateService.includes('getAutomaticUpdateCheckIntervalMs()'));
		assert.ok(updateService.includes('getAutomaticUpdateInitialDelayMs()'));
	});

	test('keeps background directory prefetch gentle so foreground navigation is not starved', () => {
		const editor = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');

		assert.ok(editor.includes('const PANE_DIRECTORY_PREFETCH_LIMIT = 6;'));
		assert.ok(editor.includes('const PANE_DIRECTORY_PREFETCH_CONCURRENCY = 1;'));
	});

	test('reserves the TurboFile bottom taskbar height for the terminal panel', () => {
		const css = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/media/turbofile.css'), 'utf8');

		assert.ok(css.includes('--turbofile-taskbar-height: 24px;'));
		assert.ok(css.includes('body.turbofile-shell.turbofile-main-editor-visible:has(.turbofile-taskbar)'));
		assert.ok(css.includes('.part.panel.bottom .pane-body.integrated-terminal'));
		assert.ok(css.includes('padding-bottom: var(--turbofile-taskbar-height);'));
		assert.ok(css.includes('height: var(--turbofile-taskbar-height);'));
	});

	test('packages the drag extension from the versioned resource folder when win32 versioned update is enabled', () => {
		const inno = fs.readFileSync(path.join(process.cwd(), 'build/win32/code.iss'), 'utf8');

		assert.ok(inno.includes('#if VersionedResourcesFolder != ""'));
		assert.ok(inno.includes('Source: "{#VersionedResourcesFolder}\\resources\\app\\resources\\turbofile\\drag-ext\\*"'));
		assert.ok(inno.includes('Flags: ignoreversion recursesubdirs createallsubdirs restartreplace uninsrestartdelete'));
	});
});
