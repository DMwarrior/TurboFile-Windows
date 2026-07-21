/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

function serviceSource(): string {
	return fs.readFileSync(path.join(process.cwd(), 'src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts'), 'utf8');
}

suite('TurboFileTransfer148Baseline', () => {
	test('uses the 1.148.0 direct tar pipelines without a progress relay', () => {
		const source = serviceSource();

		assert.deepStrictEqual({
			hasDirectTarPipe: source.includes('tar -cf - -C'),
			hasProgressRelayBuilder: source.includes('buildTarProgressPipeCommand'),
			hasProgressMarker: source.includes('TURBOFILE_TAR_PROGRESS_MARKER')
		}, {
			hasDirectTarPipe: true,
			hasProgressRelayBuilder: false,
			hasProgressMarker: false
		});
	});

	test('does not retain post-1.148 tar staging and watchdog behavior', () => {
		const source = serviceSource();

		assert.deepStrictEqual({
			hasTarWatchdog: source.includes('createTarStreamWatchdog'),
			hasTarDrainWait: source.includes('waitForTarDrain'),
			hasHiddenTransferStaging: source.includes('.turbofile-transfer-${randomUUID()}.partial')
		}, {
			hasTarWatchdog: false,
			hasTarDrainWait: false,
			hasHiddenTransferStaging: false
		});
	});
});
