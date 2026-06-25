/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { shouldRetargetWindowsDesktopPane } from '../../common/turbofileWindowsLocation.js';

suite('TurboFileWindowsLocation', () => {
	test('retargets panes opened on the profile Desktop when the real Desktop is relocated', () => {
		assert.strictEqual(shouldRetargetWindowsDesktopPane(
			'C:\\Users\\13093\\Desktop',
			'C:\\Users\\13093\\Desktop',
			'C:\\Users\\13093\\Desktop'
		), true);
	});

	test('keeps panes that are not opened on the Desktop', () => {
		assert.strictEqual(shouldRetargetWindowsDesktopPane(
			'D:\\Work',
			'C:\\Users\\13093\\Desktop',
			'C:\\Users\\13093\\Desktop'
		), false);
	});
});
