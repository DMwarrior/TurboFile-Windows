/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TurboFilePreparedDirectRouteCache } from '../../common/turbofilePreparedDirectRouteCache.js';

suite('TurboFilePreparedDirectRouteCache', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('stores the physical direct direction for both transfer directions', () => {
		const cache = new TurboFilePreparedDirectRouteCache();
		cache.rememberRoute('device-a', 'device-b', 'scp', 'source-push');

		assert.strictEqual(cache.getRoute('device-a', 'device-b', 'scp'), 'source-push');
		assert.strictEqual(cache.getRoute('device-b', 'device-a', 'scp'), 'target-pull');
		assert.strictEqual(cache.isRelay('device-a', 'device-b', 'scp'), false);
		assert.strictEqual(cache.isRelay('device-b', 'device-a', 'scp'), false);
	});

	test('stores a conclusive relay decision in both directions', () => {
		const cache = new TurboFilePreparedDirectRouteCache();
		cache.rememberRelay('device-a', 'device-b', 'scp');

		assert.strictEqual(cache.isRelay('device-a', 'device-b', 'scp'), true);
		assert.strictEqual(cache.isRelay('device-b', 'device-a', 'scp'), true);
		assert.strictEqual(cache.getRoute('device-a', 'device-b', 'scp'), undefined);
	});

	test('replaces stale decisions and keeps protocols isolated', () => {
		const cache = new TurboFilePreparedDirectRouteCache();
		cache.rememberRelay('device-a', 'device-b', 'scp');
		cache.rememberRoute('device-a', 'device-b', 'scp', 'target-pull');
		cache.rememberRelay('device-a', 'device-b', 'tar');

		assert.strictEqual(cache.isRelay('device-a', 'device-b', 'scp'), false);
		assert.strictEqual(cache.getRoute('device-a', 'device-b', 'scp'), 'target-pull');
		assert.strictEqual(cache.getRoute('device-b', 'device-a', 'scp'), 'source-push');
		assert.strictEqual(cache.isRelay('device-a', 'device-b', 'tar'), true);
	});

	test('invalidates both views of a failed physical direction', () => {
		const cache = new TurboFilePreparedDirectRouteCache();
		cache.rememberRoute('device-a', 'device-b', 'scp', 'source-push');
		cache.forgetRoute('device-a', 'device-b', 'scp', 'source-push');

		assert.strictEqual(cache.getRoute('device-a', 'device-b', 'scp'), undefined);
		assert.strictEqual(cache.getRoute('device-b', 'device-a', 'scp'), undefined);
	});

	test('keeps the last decision readable while marking it for background refresh', () => {
		const cache = new TurboFilePreparedDirectRouteCache();
		cache.rememberRoute('device-a', 'device-b', 'scp', 'source-push', 1000);

		assert.strictEqual(cache.needsRefresh('device-a', 'device-b', 'scp', 5000, 5999), false);
		assert.strictEqual(cache.needsRefresh('device-a', 'device-b', 'scp', 5000, 6000), true);
		assert.strictEqual(cache.getRoute('device-a', 'device-b', 'scp'), 'source-push');
	});

	test('uses the preferred prepared route when both directions were recorded independently', () => {
		const cache = new TurboFilePreparedDirectRouteCache();
		cache.rememberRoute('device-a', 'device-b', 'scp', 'source-push');
		cache.rememberRoute('device-a', 'device-b', 'tar', 'target-pull');

		assert.strictEqual(cache.getRoute('device-a', 'device-b', 'scp', 'target-pull'), 'source-push');
		assert.strictEqual(cache.getRoute('device-a', 'device-b', 'tar', 'source-push'), 'target-pull');
	});

	test('a conclusive relay refresh clears both views of an old direct route', () => {
		const cache = new TurboFilePreparedDirectRouteCache();
		cache.rememberRoute('device-a', 'device-b', 'scp', 'source-push');
		cache.rememberRelay('device-a', 'device-b', 'scp');

		assert.strictEqual(cache.getRoute('device-a', 'device-b', 'scp'), undefined);
		assert.strictEqual(cache.getRoute('device-b', 'device-a', 'scp'), undefined);
		assert.strictEqual(cache.isRelay('device-a', 'device-b', 'scp'), true);
		assert.strictEqual(cache.isRelay('device-b', 'device-a', 'scp'), true);
	});

	test('an old transfer failure cannot erase a newer background refresh', () => {
		const cache = new TurboFilePreparedDirectRouteCache();
		cache.rememberRoute('device-a', 'device-b', 'scp', 'source-push', 1000);
		const oldSnapshot = cache.getRouteSnapshot('device-a', 'device-b', 'scp');
		cache.rememberRoute('device-a', 'device-b', 'scp', 'source-push', 2000);
		const refreshedSnapshot = cache.getRouteSnapshot('device-a', 'device-b', 'scp');

		assert.ok(oldSnapshot);
		assert.ok(refreshedSnapshot);
		cache.forgetRoute('device-a', 'device-b', 'scp', 'source-push', oldSnapshot.generation);

		assert.notStrictEqual(oldSnapshot.generation, refreshedSnapshot.generation);
		assert.deepStrictEqual(cache.getRouteSnapshot('device-a', 'device-b', 'scp'), refreshedSnapshot);
	});
});
