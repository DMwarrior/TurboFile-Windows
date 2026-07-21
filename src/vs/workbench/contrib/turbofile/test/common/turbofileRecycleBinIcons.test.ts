/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { getTurboFileRecycleBinIcon } from '../../browser/turbofileRecycleBinIcons.js';

suite('TurboFileRecycleBinIcons', () => {
	function decodePng(dataUri: string): Uint8Array {
		assert.ok(dataUri.startsWith('data:image/png;base64,'));
		return Uint8Array.from(atob(dataUri.slice('data:image/png;base64,'.length)), value => value.charCodeAt(0));
	}

	function readUint32(bytes: Uint8Array, offset: number): number {
		return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
	}

	test('bundles distinct Windows empty and full Recycle Bin PNG icons', () => {
		const empty = getTurboFileRecycleBinIcon(false);
		const full = getTurboFileRecycleBinIcon(true);

		assert.notStrictEqual(empty, full);
		for (const icon of [empty, full]) {
			const bytes = decodePng(icon);
			assert.deepStrictEqual([...bytes.slice(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
			assert.strictEqual(readUint32(bytes, 16), 32);
			assert.strictEqual(readUint32(bytes, 20), 32);
		}
	});
});
