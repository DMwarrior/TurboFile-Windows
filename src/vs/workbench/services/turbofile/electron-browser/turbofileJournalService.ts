/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IChannel, ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { registerSharedProcessRemoteService } from '../../../../platform/ipc/electron-browser/services.js';
import { ITurboFileJournalQuery, ITurboFileJournalService, ITurboFileJournalWrite, TURBOFILE_JOURNAL_CHANNEL } from '../../../../platform/turbofile/common/turbofileJournal.js';

/** Keep one IPC subscription while page views attach and detach their local listeners. */
export class TurboFileJournalChannelClient extends Disposable implements ITurboFileJournalService {
	declare readonly _serviceBrand: undefined;
	private readonly changed = this._register(new Emitter<void>());
	readonly onDidChange = this.changed.event;
	private readonly remote: ITurboFileJournalService;

	constructor(channel: IChannel) {
		super();
		this.remote = ProxyChannel.toService<ITurboFileJournalService>(channel);
		// The delayed service proxy caches event properties. Reusing a disposed IPC event
		// would lose its response handler when the user returns to the journal page.
		this._register(this.remote.onDidChange(() => this.changed.fire()));
	}

	append(write: ITurboFileJournalWrite): Promise<void> { return this.remote.append(write); }
	query(query: ITurboFileJournalQuery) { return this.remote.query(query); }
	flush(): Promise<void> { return this.remote.flush(); }
	reportGap(): Promise<void> { return this.remote.reportGap(); }
}

registerSharedProcessRemoteService(ITurboFileJournalService, TURBOFILE_JOURNAL_CHANNEL, { channelClientCtor: TurboFileJournalChannelClient });
