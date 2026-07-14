/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { SerializedError } from '../../../base/common/errors.js';
import { IDisposable } from '../../../base/common/lifecycle.js';
import { UriComponents } from '../../../base/common/uri.js';
import { ExtensionIdentifier } from '../../../platform/extensions/common/extensions.js';
import { IChatMessage, IChatResponsePart, ILanguageModelChatSelector } from '../../contrib/chat/common/languageModels.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { ProxyIdentifier, SerializableObjectWithBuffers } from '../../services/extensions/common/proxyIdentifier.js';
import { MainContext, MainThreadChatOutputRendererShape, MainThreadLanguageModelsShape } from '../common/extHost.protocol.js';

@extHostNamedCustomer(MainContext.MainThreadLanguageModels)
export class TurboFileNullMainThreadLanguageModels implements MainThreadLanguageModelsShape {

	dispose(): void { }

	$registerLanguageModelProvider(_vendor: string): void { }
	$onLMProviderChange(_vendor: string): void { }
	$unregisterProvider(_vendor: string): void { }

	$tryStartChatRequest(_extension: ExtensionIdentifier, _modelIdentifier: string, _requestId: number, _messages: SerializableObjectWithBuffers<IChatMessage[]>, _options: {}, _token: CancellationToken): Promise<void> {
		return Promise.reject(new Error('Language models are not available in TurboFile.'));
	}

	$reportResponsePart(_requestId: number, _chunk: SerializableObjectWithBuffers<IChatResponsePart | IChatResponsePart[]>): Promise<void> {
		return Promise.resolve();
	}

	$reportResponseDone(_requestId: number, _error: SerializedError | undefined): Promise<void> {
		return Promise.resolve();
	}

	$selectChatModels(_selector: ILanguageModelChatSelector): Promise<string[]> {
		return Promise.resolve([]);
	}

	$countTokens(_modelId: string, value: string | IChatMessage, _token: CancellationToken): Promise<number> {
		return Promise.resolve(typeof value === 'string' ? value.length : 0);
	}

	$fileIsIgnored(_uri: UriComponents, _token: CancellationToken): Promise<boolean> {
		return Promise.resolve(false);
	}

	$registerFileIgnoreProvider(_handle: number): void { }
	$unregisterFileIgnoreProvider(_handle: number): void { }
}

@extHostNamedCustomer(MainContext.MainThreadChatOutputRenderer)
export class TurboFileNullMainThreadChatOutputRenderer implements MainThreadChatOutputRendererShape {

	dispose(): void { }
	$registerChatOutputRenderer(_viewType: string, _extensionId: ExtensionIdentifier, _extensionLocation: UriComponents): void { }
	$unregisterChatOutputRenderer(_viewType: string): void { }
}

class TurboFileNullMainThreadCustomer implements IDisposable {

	constructor(_context: IExtHostContext) {
		return new Proxy(this, {
			get: (target, property, receiver) => {
				if (property in target) {
					return Reflect.get(target, property, receiver);
				}
				return (..._args: unknown[]) => {
					throw new Error(`Unsupported TurboFile extension host method: ${String(property)}`);
				};
			}
		});
	}

	dispose(): void { }
}

const optionalMainThreadCustomers: readonly ProxyIdentifier<unknown>[] = [
	MainContext.MainThreadChatAgents2,
	MainContext.MainThreadCodeMapper,
	MainContext.MainThreadLanguageModelTools,
	MainContext.MainThreadEmbeddings,
	MainContext.MainThreadGitExtension,
	MainContext.MainThreadShare,
	MainContext.MainThreadAuthentication,
	MainContext.MainThreadTesting,
	MainContext.MainThreadMcp,
	MainContext.MainThreadAiRelatedInformation,
	MainContext.MainThreadAiEmbeddingVector,
	MainContext.MainThreadAiSettingsSearch,
	MainContext.MainThreadChatSessions,
	MainContext.MainThreadChatDebug,
	MainContext.MainThreadChatContext,
	MainContext.MainThreadChatStatus,
	MainContext.MainThreadChatInputNotification,
	MainContext.MainThreadBrowsers,
];

for (const identifier of optionalMainThreadCustomers) {
	extHostNamedCustomer(identifier as ProxyIdentifier<IDisposable>)(TurboFileNullMainThreadCustomer);
}
