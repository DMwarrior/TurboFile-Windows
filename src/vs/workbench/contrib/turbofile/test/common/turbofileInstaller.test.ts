/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('TurboFile Windows Installer', () => {
	test('lets Restart Manager replace the Explorer-loaded drag extension during user upgrades', () => {
		const installer = fs.readFileSync(path.resolve(process.cwd(), 'build/win32/code.iss'), 'utf8');
		const filters = installer.match(/^CloseApplicationsFilter=.*$/gm) ?? [];

		assert.ok(installer.includes('CloseApplications=force'));
		assert.ok(filters.length > 0);
		assert.ok(filters.every(filter => filter.includes('explorer.exe')));
		assert.match(installer, /drag-ext\\\*";[^\r\n]*Flags:[^\r\n]*restartreplace[^\r\n]*uninsrestartdelete/);
	});

	test('migrates the opposite install scope and repairs shortcuts after upgrades', () => {
		const installer = fs.readFileSync(path.resolve(process.cwd(), 'build/win32/code.iss'), 'utf8');
		const packaging = fs.readFileSync(path.resolve(process.cwd(), 'build/gulpfile.vscode.win32.ts'), 'utf8');

		assert.deepStrictEqual({
			oppositeAppId: packaging.includes("target === 'system' ? product.win32x64UserAppId : product.win32x64AppId"),
			loadsExistingInstall: installer.includes('procedure LoadIncompatibleInstallation();') && installer.includes("RegQueryStringValue({#IncompatibleTargetRootKey}, RegKey, 'InstallLocation'"),
			removesExistingInstall: installer.includes('function MigrateIncompatibleInstallation(): Boolean;') && installer.includes("ShellExec('runas', IncompatibleUninstallerPath"),
			repairsShortcuts: installer.includes('procedure RepairMigratedShortcuts();') && installer.includes('CreateShellLink(ShortcutPath'),
			migrationRunsBeforeInstall: installer.includes("if (Result = '') and not MigrateIncompatibleInstallation() then") && installer.includes('Installation was stopped to prevent two copies from being installed.'),
			shortcutRepairRunsAfterInstall: installer.indexOf('RepairMigratedShortcuts();', installer.indexOf('procedure CurStepChanged')) >= 0,
			refreshesExistingBackgroundShortcuts: installer.includes('Result := not IsBackgroundUpdate() or FileExists(Path);')
		}, {
			oppositeAppId: true,
			loadsExistingInstall: true,
			removesExistingInstall: true,
			repairsShortcuts: true,
			migrationRunsBeforeInstall: true,
			shortcutRepairRunsAfterInstall: true,
			refreshesExistingBackgroundShortcuts: true
		});
	});
});
