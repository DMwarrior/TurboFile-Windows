/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TurboFileDirectDataError, TurboFileDirectUnavailableError } from '../../common/turbofileDirectRoute.js';
import { classifyTurboFileTransferFailure, getTurboFileTransferProtocolName, getTurboFileTransferProgressState, shouldContinueTurboFileTransferPlan } from '../../common/turbofileTransferFailure.js';

suite('TurboFileTransferFailure', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('classifies terminal failures without fallback', () => {
		for (const [message, category] of [
			['Authentication failed', 'authentication'],
			['Permission denied', 'permission'],
			['Target already exists', 'conflict'],
			['ENOSPC: no space left on device', 'no-space'],
			['Transfer canceled', 'canceled']
		] as const) {
			const failure = classifyTurboFileTransferFailure(new Error(message));
			assert.strictEqual(failure.category, category);
			assert.strictEqual(shouldContinueTurboFileTransferPlan(failure), false);
			assert.strictEqual(failure.reduceConcurrency, false);
		}
	});

	test('classifies safe fallback failures', () => {
		for (const error of [
			new TurboFileDirectUnavailableError([]),
			new Error('scp: command not found'),
			new Error('connect ETIMEDOUT'),
			new Error('Transferred size mismatch')
		]) {
			assert.strictEqual(shouldContinueTurboFileTransferPlan(classifyTurboFileTransferFailure(error)), true);
		}
	});

	test('preserves a terminal cause wrapped by a direct route data error', () => {
		const failure = classifyTurboFileTransferFailure(new TurboFileDirectDataError('source-push', [], new Error('Permission denied')));
		assert.deepStrictEqual(failure, { category: 'permission', retryable: false, reduceConcurrency: false });
	});

	test('maps strategy and phase to stable public names', () => {
		assert.strictEqual(getTurboFileTransferProtocolName('scp-direct'), 'scp');
		assert.strictEqual(getTurboFileTransferProtocolName('local-copy'), 'native');
		assert.strictEqual(getTurboFileTransferProgressState('prepare'), 'preparing');
		assert.strictEqual(getTurboFileTransferProgressState('relay-upload'), 'transferring');
		assert.strictEqual(getTurboFileTransferProgressState('complete'), 'completed');
	});
});
