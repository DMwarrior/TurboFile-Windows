/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';

export type TurboFileWorkbenchPage = 'transfer' | 'devices' | 'themes' | 'settings' | 'tasks' | 'images';

export type TurboFileWorkbenchCommand =
	| { readonly type: 'showPage'; readonly page: TurboFileWorkbenchPage }
	| { readonly type: 'addDevice' }
	| { readonly type: 'refreshDevices' }
	| { readonly type: 'selectDevice'; readonly deviceId: string }
	| { readonly type: 'showSettings' }
	| { readonly type: 'showTaskLog' }
	| { readonly type: 'clearTasks' }
	| { readonly type: 'testConnection' }
	| { readonly type: 'sync' }
	| { readonly type: 'openTerminal'; readonly side: 'left' | 'right' };

class TurboFileWorkbenchBridge {
	private readonly _onDidRunCommand = new Emitter<TurboFileWorkbenchCommand>();
	readonly onDidRunCommand: Event<TurboFileWorkbenchCommand> = this._onDidRunCommand.event;

	run(command: TurboFileWorkbenchCommand): void {
		this._onDidRunCommand.fire(command);
	}
}

export const turboFileWorkbenchBridge = new TurboFileWorkbenchBridge();
