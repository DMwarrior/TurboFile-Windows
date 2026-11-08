/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { TurboFileProgressMotion } from '../../common/turbofileProgressMotion.js';

suite('TurboFileProgressMotion', () => {
	test('delayed samples keep moving after 550ms without ever exceeding confirmed progress', () => {
		const motion = new TurboFileProgressMotion();
		motion.reset(0, 0);
		let previous = 0;
		for (const time of [500, 1200, 2400, 4000]) {
			const before = motion.read(time)!;
			const target = time / 10000;
			motion.update(target, time);
			assert.strictEqual(motion.read(time), before, 'Retargeting must preserve the visible position');
			for (let offset = 16; offset <= 680; offset += 16) {
				const value = motion.read(time + offset)!;
				assert.ok(value > previous && value <= target, `${time + offset}: ${previous} -> ${value}`);
				previous = value;
			}
		}
		assert.strictEqual(motion.read(60000), 0.4, 'No new bytes means no invented progress');
	});

	test('larger measured byte deltas move proportionally faster', () => {
		const slow = new TurboFileProgressMotion();
		const fast = new TurboFileProgressMotion();
		for (const motion of [slow, fast]) {
			motion.reset(0, 0);
		}
		slow.update(0.1, 500);
		fast.update(0.4, 500);
		assert.ok(Math.abs(fast.read(1000)! / slow.read(1000)! - 4) < 1e-10);
	});

	test('identical snapshots do not restart motion; stage changes reset instead of running backward', () => {
		const motion = new TurboFileProgressMotion();
		motion.reset(0, 0);
		const plan = motion.update(0.5, 500);
		const before = motion.read(1000);
		assert.strictEqual(motion.update(0.5, 1000), plan);
		assert.strictEqual(motion.read(1000), before);
		assert.strictEqual(motion.update(0.1, 1200), undefined);
		assert.strictEqual(motion.read(1200), 0.1);
		motion.reset(undefined, 1500);
		assert.strictEqual(motion.read(1600), undefined);
	});
});
