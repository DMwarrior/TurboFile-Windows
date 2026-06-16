/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { withTurboFileTimeout } from '../../common/turbofileTimeout.js';

suite('TurboFileTimeout', () => {
	test('resolves when the operation finishes before the timeout', async () => {
		assert.strictEqual(await withTurboFileTimeout(Promise.resolve('ok'), 1000, 'timeout'), 'ok');
	});

	test('rejects when the operation does not finish before the timeout', async () => {
		await assert.rejects(
			withTurboFileTimeout(new Promise<string>(() => undefined), 1, 'directory read timed out'),
			/directory read timed out/
		);
	});
});
