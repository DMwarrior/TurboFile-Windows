/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';

export type TurboFileWorkbenchPage = 'transfer' | 'devices' | 'settings' | 'tasks' | 'images';

interface TurboFileWorkbenchTarget {
	readonly targetInstanceId?: string;
}

export type TurboFileWorkbenchCommand =
	| ({ readonly type: 'showPage'; readonly page: TurboFileWorkbenchPage } & TurboFileWorkbenchTarget)
	| ({ readonly type: 'addDevice' } & TurboFileWorkbenchTarget)
	| ({ readonly type: 'refreshDevices' } & TurboFileWorkbenchTarget)
	| ({ readonly type: 'selectDevice'; readonly deviceId: string } & TurboFileWorkbenchTarget)
	| ({ readonly type: 'showSettings' } & TurboFileWorkbenchTarget)
	| ({ readonly type: 'showTaskLog' } & TurboFileWorkbenchTarget)
	| ({ readonly type: 'clearTasks' } & TurboFileWorkbenchTarget)
	| ({ readonly type: 'testConnection' } & TurboFileWorkbenchTarget)
	| ({ readonly type: 'sync' } & TurboFileWorkbenchTarget)
	| ({ readonly type: 'openTerminal'; readonly side: 'left' | 'right' } & TurboFileWorkbenchTarget);

export interface TurboFileWorkbenchPageChangedEvent {
	readonly instanceId: string;
	readonly page: TurboFileWorkbenchPage;
}

class TurboFileWorkbenchBridge {
	private readonly _onDidRunCommand = new Emitter<TurboFileWorkbenchCommand>();
	readonly onDidRunCommand: Event<TurboFileWorkbenchCommand> = this._onDidRunCommand.event;
	private readonly _onDidChangeActivePage = new Emitter<TurboFileWorkbenchPageChangedEvent>();
	readonly onDidChangeActivePage: Event<TurboFileWorkbenchPageChangedEvent> = this._onDidChangeActivePage.event;

	run(command: TurboFileWorkbenchCommand): void {
		this._onDidRunCommand.fire(command.type === 'showPage' ? { ...command, page: this.normalizePage(command.page) } : command);
	}

	reportActivePage(instanceId: string, page: TurboFileWorkbenchPage): void {
		this._onDidChangeActivePage.fire({ instanceId, page: this.normalizePage(page) });
	}

	private normalizePage(page: string): TurboFileWorkbenchPage {
		switch (page) {
			case 'devices':
			case 'settings':
			case 'tasks':
			case 'images':
				return page;
			default:
				// Removed pages such as the legacy appearance page return to the transfer view.
				return 'transfer';
		}
	}
}

export const turboFileWorkbenchBridge = new TurboFileWorkbenchBridge();
