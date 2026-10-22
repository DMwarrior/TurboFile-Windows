/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ChannelClient, ChannelServer, ProxyChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TurboFileJournalChannelClient } from '../../electron-browser/turbofileJournalService.js';

suite('TurboFile journal page subscriptions', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('receives committed summaries after repeatedly closing and reopening the page', async () => {
		const clientMessages = disposables.add(new Emitter<VSBuffer>());
		const serverMessages = disposables.add(new Emitter<VSBuffer>());
		const committed = disposables.add(new Emitter<void>());
		const channelDisposables = disposables.add(new DisposableStore());
		const server = disposables.add(new ChannelServer({ onMessage: serverMessages.event, send: buffer => queueMicrotask(() => clientMessages.fire(buffer)) }, 'journal-test'));
		const client = disposables.add(new ChannelClient({ onMessage: clientMessages.event, send: buffer => queueMicrotask(() => serverMessages.fire(buffer)) }));
		server.registerChannel('journal', ProxyChannel.fromService({ onDidChange: committed.event, query: async () => ({ records: [] }) }, channelDisposables));
		const service = disposables.add(new TurboFileJournalChannelClient(client.getChannel('journal')));
		// This event reference is cached by delayed service instantiation in the workbench.
		const onDidChange = service.onDidChange;
		let notifications = 0;
		for (let visit = 0; visit < 3; visit++) {
			const listener = onDidChange(() => notifications++);
			await service.query({});
			committed.fire();
			await timeout(0);
			listener.dispose();
		}
		assert.strictEqual(notifications, 3);
	});
});
