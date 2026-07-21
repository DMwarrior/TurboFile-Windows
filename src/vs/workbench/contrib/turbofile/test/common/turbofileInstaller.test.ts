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
});
