/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { buildPosixStatEntriesCommand, parseRemoteStatEntries } from '../../common/turbofileRemoteStat.js';

suite('TurboFileRemoteStat', () => {
	test('keeps lazy directory metadata enrichment best-effort when one entry cannot be statted', () => {
		const command = buildPosixStatEntriesCommand('/home/ubuntu/work/Qingwei_Autotrain/data', ['ok', 'missing']);

		assert.ok(command.includes('stat --printf='));
		assert.ok(command.includes('|| true'));
	});

	test('parses stat output into millisecond modified times', () => {
		const nul = '\u0000';
		assert.deepStrictEqual(
			parseRemoteStatEntries(`./folder${nul}8${nul}1782455840${nul}./file.txt${nul}917${nul}1782454980${nul}`),
			[
				{ name: 'folder', size: 8, modified: 1782455840000 },
				{ name: 'file.txt', size: 917, modified: 1782454980000 }
			]
		);
	});
});
