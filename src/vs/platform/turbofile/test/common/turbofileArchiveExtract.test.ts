/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { buildTurboFileRemoteExtractCommand, isTurboFileTarFamilyArchivePath } from '../../common/turbofileArchiveExtract.js';

suite('TurboFileArchiveExtract', function () {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('extracts zip with GBK-aware tools before generic bsdtar fallback', () => {
		const command = buildTurboFileRemoteExtractCommand('/tmp/中文.zip', '\'/tmp/中文.zip\'');

		assert.ok(command.includes('unzip -O GBK'), command);
		assert.ok(command.includes('metadata_encoding="gbk"'), command);
		assert.ok(command.indexOf('unzip -O GBK') < command.indexOf('bsdtar -xf'), command);
		assert.ok(command.indexOf('python3 -c') < command.indexOf('bsdtar -xf'), command);
	});

	test('keeps tar-family archives on tar first', () => {
		assert.strictEqual(isTurboFileTarFamilyArchivePath('/tmp/data.tar.gz'), true);

		const command = buildTurboFileRemoteExtractCommand('/tmp/data.tar.gz', '\'/tmp/data.tar.gz\'');
		assert.ok(command.startsWith('if command -v tar '), command);
		assert.ok(!command.includes('unzip -O GBK'), command);
	});
});
