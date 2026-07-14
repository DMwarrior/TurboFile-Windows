/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IChatEditingService, IChatEditingSession, IChatEditingSessionProvider } from '../../chat/common/editing/chatEditingService.js';
import { ChatModel } from '../../chat/common/model/chatModel.js';
import { IDebugService } from '../../debug/common/debug.js';
import { NullDebugService, NullDebugVisualizerService } from '../../debug/common/nullDebugService.js';
import { IDebugVisualizerService } from '../../debug/common/debugVisualizers.js';
import { IInlineChatSession, IInlineChatSessionService } from '../../inlineChat/browser/inlineChatSessionService.js';

class TurboFileNullInlineChatSessionService implements IInlineChatSessionService {

	declare readonly _serviceBrand: undefined;

	readonly onWillStartSession = Event.None;
	readonly onDidChangeSessions = Event.None;

	createSession(_editor: ICodeEditor): IInlineChatSession {
		throw new Error('Inline chat is not available in TurboFile.');
	}

	getSessionByTextModel(_uri: URI): IInlineChatSession | undefined {
		return undefined;
	}

	getSessionBySessionUri(_uri: URI): IInlineChatSession | undefined {
		return undefined;
	}
}

class TurboFileNullChatEditingService implements IChatEditingService {

	declare readonly _serviceBrand: undefined;

	readonly editingSessionsObs = constObservable<readonly IChatEditingSession[]>([]);

	startOrContinueGlobalEditingSession(_chatModel: ChatModel): IChatEditingSession {
		throw new Error('Chat editing is not available in TurboFile.');
	}

	getEditingSession(_chatSessionResource: URI): IChatEditingSession | undefined {
		return undefined;
	}

	createEditingSession(_chatModel: ChatModel): IChatEditingSession {
		throw new Error('Chat editing is not available in TurboFile.');
	}

	transferEditingSession(_chatModel: ChatModel, _session: IChatEditingSession): IChatEditingSession {
		throw new Error('Chat editing is not available in TurboFile.');
	}

	registerEditingSessionProvider(_scheme: string, _provider: IChatEditingSessionProvider): IDisposable {
		return Disposable.None;
	}
}

registerSingleton(IInlineChatSessionService, TurboFileNullInlineChatSessionService, InstantiationType.Delayed);
registerSingleton(IChatEditingService, TurboFileNullChatEditingService, InstantiationType.Delayed);
registerSingleton(IDebugService, NullDebugService, InstantiationType.Delayed);
registerSingleton(IDebugVisualizerService, NullDebugVisualizerService, InstantiationType.Delayed);
