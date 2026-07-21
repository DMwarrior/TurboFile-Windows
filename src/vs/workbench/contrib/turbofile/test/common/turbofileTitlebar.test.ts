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
		assert.ok(!product.includes('"win32VersionedUpdate": true'));
		assert.ok(updateService.includes('getAutomaticUpdateCheckIntervalMs()'));
		assert.ok(updateService.includes('getAutomaticUpdateInitialDelayMs()'));
	});

	test('prefetches nearby SSH directories eagerly enough for fast double-click navigation', () => {
		const editor = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');

		assert.ok(editor.includes('const PANE_DIRECTORY_PREFETCH_LIMIT = 12;'));
		assert.ok(editor.includes('const PANE_DIRECTORY_PREFETCH_CONCURRENCY = 3;'));
	});

	test('reserves the native statusbar slot without adding blank space to the transfer page', () => {
		const css = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/media/turbofile.css'), 'utf8');
		const contribution = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofile.contribution.ts'), 'utf8');
		const activateShell = contribution.slice(contribution.indexOf('private activateTurboFileShell(): void'), contribution.indexOf('private async openTurboFilePage'));
		const transferPage = css.slice(css.indexOf('.turbofile-transfer-page {'), css.indexOf('.turbofile-transfer-page.has-live-transfer {'));

		assert.deepStrictEqual({
			hasNativeTaskbarHeight: css.includes('--turbofile-taskbar-height: 22px;'),
			usesNativeTaskbarHeight: css.includes('height: var(--turbofile-taskbar-height);'),
			transferPageHasDuplicateBottomSpace: transferPage.includes('padding-bottom:'),
			patchesIntegratedTerminalPadding: css.includes('.part.panel.bottom .pane-body.integrated-terminal'),
			hidesNativeStatusbar: activateShell.includes('setPartHidden(true, Parts.STATUSBAR_PART)'),
			checksNativeStatusbarVisibility: activateShell.includes('if (!this.layoutService.isVisible(Parts.STATUSBAR_PART, window))'),
			usesMemoryOnlyStatusbarOverride: activateShell.includes("this.configurationService.updateValue('workbench.statusBar.visible', true, ConfigurationTarget.MEMORY)")
		}, {
			hasNativeTaskbarHeight: true,
			usesNativeTaskbarHeight: true,
			transferPageHasDuplicateBottomSpace: false,
			patchesIntegratedTerminalPadding: false,
			hidesNativeStatusbar: false,
			checksNativeStatusbarVisibility: true,
			usesMemoryOnlyStatusbarOverride: true
		});
	});

	test('hides VS Code problem counters without hiding the TurboFile taskbar', () => {
		const css = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/media/turbofile.css'), 'utf8');

		assert.ok(css.includes('.statusbar-item[id="status.problems"]'));
		assert.ok(css.includes('.statusbar-item[id="status.problemsVisibility"]'));
		assert.ok(css.includes('display: none !important;'));
	});

	test('packages the drag extension with deferred replacement without enabling win32 versioned update', () => {
		const inno = fs.readFileSync(path.join(process.cwd(), 'build/win32/code.iss'), 'utf8');
		const product = fs.readFileSync(path.join(process.cwd(), 'product.json'), 'utf8');

		assert.ok(!product.includes('"win32VersionedUpdate": true'));
		assert.ok(inno.includes('Source: "resources\\app\\resources\\turbofile\\drag-ext\\*"'));
		assert.ok(inno.includes('Flags: ignoreversion recursesubdirs createallsubdirs restartreplace uninsrestartdelete'));
	});
});
