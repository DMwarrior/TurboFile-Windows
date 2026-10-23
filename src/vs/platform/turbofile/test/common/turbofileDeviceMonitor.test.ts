/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { getTurboFileMonitorCpuPercent, parseTurboFileMonitorCpu, parseTurboFileMonitorDisk, parseTurboFileMonitorMemory } from '../../common/turbofileDeviceMonitor.js';

suite('TurboFile device monitor parsing (adapted from Electerm)', () => {
	test('uses counter deltas, excludes guest counters and accounts for idle/iowait', () => {
		const before = parseTurboFileMonitorCpu('cpu 100 0 50 800 20 10 10 10 9000 0');
		const after = parseTurboFileMonitorCpu('cpu 130 0 60 840 30 10 10 20 9900 0');
		assert.deepStrictEqual([before?.length, getTurboFileMonitorCpuPercent(before, after)], [8, 50]);
	});
	test('does not fabricate zero load for a first, invalid, unchanged or reset sample', () => {
		assert.deepStrictEqual([
			getTurboFileMonitorCpuPercent(undefined, [1, 2, 3, 4]),
			getTurboFileMonitorCpuPercent([1, 2, 3, 4], [1, 2, 3, 4]),
			getTurboFileMonitorCpuPercent([4, 5, 6, 7], [1, 2, 3, 4]),
			parseTurboFileMonitorCpu('cpu 1 NaN 3 4')
		], [undefined, undefined, undefined, undefined]);
	});
	test('uses MemAvailable rather than counting reclaimable cache as used memory', () => {
		assert.deepStrictEqual(parseTurboFileMonitorMemory('MemTotal: 125829120 kB\nMemFree: 1024 kB\nMemAvailable: 104857600 kB'), { memoryTotal: 128849018880, memoryUsed: 21474836480 });
	});
	test('handles old kernels, impossible available values and unsupported output', () => {
		assert.deepStrictEqual([parseTurboFileMonitorMemory('MemTotal: 100 kB\nMemFree: 25 kB'), parseTurboFileMonitorMemory('MemTotal: 100 kB\nMemAvailable: 200 kB'), parseTurboFileMonitorMemory('permission denied')], [{ memoryTotal: 102400, memoryUsed: 76800 }, { memoryTotal: 102400, memoryUsed: 0 }, {}]);
	});
	test('keeps full byte sizes and the requested path for a filesystem with spaces', () => {
		assert.deepStrictEqual(parseTurboFileMonitorDisk('Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/sda 10485760000 9437184000 1048576000 90% /data with spaces\n', '/data with spaces/sub'), { path: '/data with spaces/sub', total: 10737418240000, used: 9663676416000, available: 1073741824000, percent: 90 });
	});
	test('retains overfull filesystems with negative available space', () => {
		assert.deepStrictEqual(parseTurboFileMonitorDisk('/dev/test 1000 1100 -100 110% /full', '/full'), { path: '/full', total: 1024000, used: 1126400, available: -102400, percent: 110 });
	});
	test('does not count filesystem reserved blocks as used data', () => {
		assert.deepStrictEqual(parseTurboFileMonitorDisk('/dev/test 1000 200 700 23% /data', '/data'), { path: '/data', total: 1024000, used: 204800, available: 716800, percent: 23 });
	});
});
