/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { TurboFileKeyedGeneration } from '../../common/turbofileKeyedGeneration.js';

suite('TurboFileKeyedGeneration', () => {
	test('stale generations cannot clear a newer resource for the same key', () => {
		const generations = new TurboFileKeyedGeneration();
		const oldGeneration = generations.next('ssh-session');
		const newGeneration = generations.next('ssh-session');

		assert.strictEqual(generations.clearIfCurrent('ssh-session', oldGeneration), false);
		assert.strictEqual(generations.isCurrent('ssh-session', newGeneration), true);
	});

	test('the current generation can be cleared exactly once', () => {
		const generations = new TurboFileKeyedGeneration();
		const generation = generations.next('ssh-session');

		assert.strictEqual(generations.clearIfCurrent('ssh-session', generation), true);
		assert.strictEqual(generations.clearIfCurrent('ssh-session', generation), false);
		assert.strictEqual(generations.current('ssh-session'), undefined);
	});
});
