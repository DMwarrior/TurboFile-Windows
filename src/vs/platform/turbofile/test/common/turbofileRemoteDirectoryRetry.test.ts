/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { getRemoteDirectoryReadRetryDelay, REMOTE_DIRECTORY_READ_MAX_ATTEMPTS, shouldRetryRemoteDirectoryRead } from '../../common/turbofileRemoteDirectoryRetry.js';

suite('TurboFileRemoteDirectoryRetry', () => {
	test('retries transient SSH/SFTP session failures', () => {
		assert.strictEqual(shouldRetryRemoteDirectoryRead(new Error('No response from server')), true);
		assert.strictEqual(shouldRetryRemoteDirectoryRead(new Error('Channel is not open')), true);
		assert.strictEqual(shouldRetryRemoteDirectoryRead(new Error('Remote directory read timed out after 8000 ms: /home/th')), true);
	});

	test('does not retry real path or permission errors', () => {
		assert.strictEqual(shouldRetryRemoteDirectoryRead(new Error('No such file or directory')), false);
		assert.strictEqual(shouldRetryRemoteDirectoryRead(new Error('Permission denied')), false);
		assert.strictEqual(shouldRetryRemoteDirectoryRead(new Error('Not a directory')), false);
		assert.strictEqual(shouldRetryRemoteDirectoryRead(new Error('All configured authentication methods failed')), false);
	});

	test('uses two short backoffs before the third and final attempt', () => {
		assert.strictEqual(REMOTE_DIRECTORY_READ_MAX_ATTEMPTS, 3);
		assert.strictEqual(getRemoteDirectoryReadRetryDelay(0), 100);
		assert.strictEqual(getRemoteDirectoryReadRetryDelay(1), 250);
		assert.strictEqual(getRemoteDirectoryReadRetryDelay(2), undefined);
	});
});
