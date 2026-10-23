/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { formatTurboFileMonitorCapacity, formatTurboFileMonitorCapacityPair } from '../../common/turbofileDeviceMonitorDisplay.js';

suite('TurboFile device monitor capacity display', () => {
	test('selects units from actual bytes and switches to TB only at the TB boundary', () => {
		assert.deepStrictEqual([512, 1024, 1024 ** 2, 1024 ** 3, 1023.5 * 1024 ** 3, 1024 ** 4, 1024 ** 5].map(formatTurboFileMonitorCapacity), ['512 B', '1.0 KB', '1.0 MB', '1.0 GB', '1023.5 GB', '1.0 TB', '1.0 PB']);
	});
	test('keeps a shared suffix for ordinary memory and disk capacities', () => {
		assert.strictEqual(formatTurboFileMonitorCapacityPair(26.6 * 1024 ** 3, 31.7 * 1024 ** 3), '26.6/31.7 GB');
		assert.strictEqual(formatTurboFileMonitorCapacityPair(1.2 * 1024 ** 4, 2.0 * 1024 ** 4), '1.2/2.0 TB');
	});
	test('retains separate units when usage is still GB but capacity is already TB', () => {
		assert.strictEqual(formatTurboFileMonitorCapacityPair(850 * 1024 ** 3, 1.8 * 1024 ** 4), '850.0 GB/1.8 TB');
	});
	test('keeps zero and overfull values honest without displaying invalid numbers', () => {
		assert.strictEqual(formatTurboFileMonitorCapacityPair(0, 0), '0/0 B');
		assert.strictEqual(formatTurboFileMonitorCapacityPair(1.1 * 1024 ** 4, 1024 ** 4), '1.1/1.0 TB');
		assert.strictEqual(formatTurboFileMonitorCapacity(-100 * 1024), '-100.0 KB');
		assert.deepStrictEqual([formatTurboFileMonitorCapacity(NaN), formatTurboFileMonitorCapacity(Infinity), formatTurboFileMonitorCapacityPair(100, NaN)], ['—', '—', '—']);
	});
});
