/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { formatTurboFileImageDimensions } from '../../common/turbofileImageDimensions.js';

suite('TurboFileImageDimensions', () => {
	test('prefers original dimensions over transformed preview dimensions', () => {
		assert.strictEqual(formatTurboFileImageDimensions({
			width: 1920,
			height: 360,
			originalWidth: 2048,
			originalHeight: 384
		}), '2048 × 384');
	});

	test('falls back to transformed dimensions when original dimensions are absent', () => {
		assert.strictEqual(formatTurboFileImageDimensions({
			width: 1920,
			height: 360
		}), '1920 × 360');
	});
});
