/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { TurboFileDirectoryInflightTracker } from '../../common/turbofileDirectoryInflight.js';

suite('TurboFileDirectoryInflightTracker', () => {
	test('foreground directory loads do not reuse background prefetch requests', () => {
		const tracker = new TurboFileDirectoryInflightTracker<string>();
		const prefetch = new Promise<string>(() => undefined);

		tracker.set('device:/path', 'prefetch', prefetch);

		assert.strictEqual(tracker.getReusable('device:/path', 'foreground'), undefined);
	});

	test('foreground directory loads reuse foreground requests', () => {
		const tracker = new TurboFileDirectoryInflightTracker<string>();
		const foreground = Promise.resolve('ok');

		tracker.set('device:/path', 'foreground', foreground);

		assert.strictEqual(tracker.getReusable('device:/path', 'foreground'), foreground);
	});

	test('settled stale prefetch requests do not remove newer foreground requests', async () => {
		const tracker = new TurboFileDirectoryInflightTracker<string>();
		let resolvePrefetch!: (value: string) => void;
		const prefetch = new Promise<string>(resolve => {
			resolvePrefetch = resolve;
		});
		const foreground = new Promise<string>(() => undefined);

		tracker.set('device:/path', 'prefetch', prefetch);
		tracker.set('device:/path', 'foreground', foreground);
		resolvePrefetch('old');
		await prefetch;

		assert.strictEqual(tracker.getReusable('device:/path', 'foreground'), foreground);
	});
});
