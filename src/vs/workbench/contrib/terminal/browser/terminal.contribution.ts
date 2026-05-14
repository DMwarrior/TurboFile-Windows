/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getFontSnippets } from '../../../../base/browser/fonts.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { Disposable, DisposableMap, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import * as nls from '../../../../nls.js';
import { Extensions as DragAndDropExtensions, IDragAndDropContributionRegistry, IDraggedResourceEditorInput } from '../../../../platform/dnd/browser/dnd.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ITerminalLogService } from '../../../../platform/terminal/common/terminal.js';
import { TerminalLogService } from '../../../../platform/terminal/common/terminalLogService.js';
import { registerTerminalPlatformConfiguration } from '../../../../platform/terminal/common/terminalPlatformConfiguration.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../common/editor.js';
import { IViewContainersRegistry, IViewsRegistry, Extensions as ViewContainerExtensions, ViewContainerLocation, WindowEnablement } from '../../../common/views.js';
import { ITerminalProfileService, TERMINAL_VIEW_ID, TerminalCommandId } from '../common/terminal.js';
import { TerminalEditingService } from './terminalEditingService.js';
import { registerColors } from '../common/terminalColorRegistry.js';
import { registerTerminalConfiguration } from '../common/terminalConfiguration.js';
import { terminalStrings } from '../common/terminalStrings.js';
import './media/terminal.css';
import './media/terminalVoice.css';
import './media/widgets.css';
import './media/xterm.css';
import { RemoteTerminalBackendContribution } from './remoteTerminalBackend.js';
import { IAhpTerminalCommandSource, IChatTerminalToolProgressPart, ITerminalChatService, ITerminalConfigurationService, ITerminalEditingService, ITerminalEditorService, ITerminalGroupService, ITerminalInstance, ITerminalInstanceService, ITerminalService, TerminalDataTransfers, terminalEditorId } from './terminal.js';
import { registerTerminalActions } from './terminalActions.js';
import { setupTerminalCommands } from './terminalCommands.js';
import { TerminalConfigurationService } from './terminalConfigurationService.js';
import { TerminalEditor } from './terminalEditor.js';
import { TerminalEditorInput } from './terminalEditorInput.js';
import { TerminalInputSerializer } from './terminalEditorSerializer.js';
import { TerminalEditorService } from './terminalEditorService.js';
import { TerminalGroupService } from './terminalGroupService.js';
import { terminalViewIcon } from './terminalIcons.js';
import { TerminalInstanceService } from './terminalInstanceService.js';
import { TerminalMainContribution } from './terminalMainContribution.js';
import { setupTerminalMenus } from './terminalMenus.js';
import { TerminalProfileService } from './terminalProfileService.js';
import { TerminalService } from './terminalService.js';
import { TerminalTelemetryContribution } from './terminalTelemetry.js';
import { TerminalViewPane } from './terminalView.js';
import { AgentHostTerminalService, IAgentHostTerminalService } from './agentHostTerminalService.js';
import { ChatContextPickService, IChatContextPickService } from '../../chat/browser/attachments/chatContextPickService.js';
import { IChatWidget, IChatWidgetService } from '../../chat/browser/chat.js';
import { ChatAgentLocation } from '../../chat/common/constants.js';

// Register services
registerSingleton(ITerminalLogService, TerminalLogService, InstantiationType.Delayed);
registerSingleton(ITerminalConfigurationService, TerminalConfigurationService, InstantiationType.Delayed);
registerSingleton(ITerminalService, TerminalService, InstantiationType.Delayed);
registerSingleton(ITerminalEditorService, TerminalEditorService, InstantiationType.Delayed);
registerSingleton(ITerminalEditingService, TerminalEditingService, InstantiationType.Delayed);
registerSingleton(ITerminalGroupService, TerminalGroupService, InstantiationType.Delayed);
registerSingleton(ITerminalInstanceService, TerminalInstanceService, InstantiationType.Delayed);
registerSingleton(ITerminalProfileService, TerminalProfileService, InstantiationType.Delayed);
registerSingleton(IAgentHostTerminalService, AgentHostTerminalService, InstantiationType.Delayed);

// Register workbench contributions
// This contribution blocks startup as it's critical to enable the web embedder window.createTerminal API
registerWorkbenchContribution2(TerminalMainContribution.ID, TerminalMainContribution, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(RemoteTerminalBackendContribution.ID, RemoteTerminalBackendContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(TerminalTelemetryContribution.ID, TerminalTelemetryContribution, WorkbenchPhase.AfterRestored);

// Register configurations
registerTerminalPlatformConfiguration();
registerTerminalConfiguration(getFontSnippets);

// Register editor/dnd contributions
Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(TerminalEditorInput.ID, TerminalInputSerializer);
Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		TerminalEditor,
		terminalEditorId,
		terminalStrings.terminal
	),
	[
		new SyncDescriptor(TerminalEditorInput)
	]
);
Registry.as<IDragAndDropContributionRegistry>(DragAndDropExtensions.DragAndDropContribution).register({
	dataFormatKey: TerminalDataTransfers.Terminals,
	getEditorInputs(data) {
		const editors: IDraggedResourceEditorInput[] = [];
		try {
			const terminalEditors: string[] = JSON.parse(data);
			for (const terminalEditor of terminalEditors) {
				editors.push({ resource: URI.parse(terminalEditor) });
			}
		} catch (error) {
			// Invalid transfer
		}
		return editors;
	},
	setData(resources, event) {
		const terminalResources = resources.filter(({ resource }) => resource.scheme === Schemas.vscodeTerminal);
		if (terminalResources.length) {
			event.dataTransfer?.setData(TerminalDataTransfers.Terminals, JSON.stringify(terminalResources.map(({ resource }) => resource.toString())));
		}
	}
});

// Register views
const VIEW_CONTAINER = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
	id: TERMINAL_VIEW_ID,
	title: nls.localize2('terminal', "Terminal"),
	icon: terminalViewIcon,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [TERMINAL_VIEW_ID, { mergeViewWithContainerWhenSingleView: true }]),
	storageId: TERMINAL_VIEW_ID,
	hideIfEmpty: true,
	order: 3,
	windowEnablement: WindowEnablement.Both
}, ViewContainerLocation.Panel, { doNotRegisterOpenCommand: true, isDefault: true });
Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry).registerViews([{
	id: TERMINAL_VIEW_ID,
	name: nls.localize2('terminal', "Terminal"),
	containerIcon: terminalViewIcon,
	canToggleVisibility: true,
	canMoveView: true,
	ctorDescriptor: new SyncDescriptor(TerminalViewPane),
	windowEnablement: WindowEnablement.Both,
	openCommandActionDescriptor: {
		id: TerminalCommandId.Toggle,
		mnemonicTitle: nls.localize({ key: 'miToggleIntegratedTerminal', comment: ['&& denotes a mnemonic'] }, "&&Terminal"),
		keybindings: {
			primary: KeyMod.CtrlCmd | KeyCode.Backquote,
			mac: { primary: KeyMod.WinCtrl | KeyCode.Backquote }
		},
		order: 3
	}
}], VIEW_CONTAINER);

registerTerminalActions();

setupTerminalCommands();

setupTerminalMenus();

registerColors();

class TurboFileTerminalChatService extends Disposable implements ITerminalChatService {
	declare _serviceBrand: undefined;

	private readonly _onDidRegisterTerminalInstanceWithToolSession = this._register(new Emitter<ITerminalInstance>());
	readonly onDidRegisterTerminalInstanceWithToolSession: Event<ITerminalInstance> = this._onDidRegisterTerminalInstanceWithToolSession.event;
	private readonly _onDidContinueInBackground = this._register(new Emitter<string>());
	readonly onDidContinueInBackground: Event<string> = this._onDidContinueInBackground.event;

	private readonly _terminalInstancesByToolSessionId = new Map<string, ITerminalInstance>();
	private readonly _toolSessionIdByTerminalInstance = new Map<ITerminalInstance, string>();
	private readonly _chatSessionResourceByTerminalInstance = new Map<ITerminalInstance, URI>();
	private readonly _terminalInstanceListenersByToolSessionId = this._register(new DisposableMap<string, IDisposable>());
	private readonly _progressParts = new Set<IChatTerminalToolProgressPart>();
	private readonly _sessionAutoApproval = new Set<string>();
	private readonly _sessionAutoApproveRules = new Map<string, Record<string, boolean | { approve: boolean; matchCommandLine?: boolean }>>();
	private readonly _ahpCommandSources = new Map<string, IAhpTerminalCommandSource>();
	private _focusedProgressPart: IChatTerminalToolProgressPart | undefined;
	private _mostRecentProgressPart: IChatTerminalToolProgressPart | undefined;

	registerTerminalInstanceWithToolSession(terminalToolSessionId: string | undefined, instance: ITerminalInstance): void {
		if (!terminalToolSessionId) {
			return;
		}
		const existingToolSessionId = this._toolSessionIdByTerminalInstance.get(instance);
		if (existingToolSessionId === terminalToolSessionId) {
			return;
		}
		if (existingToolSessionId !== undefined) {
			this._terminalInstanceListenersByToolSessionId.deleteAndDispose(existingToolSessionId);
			this._terminalInstancesByToolSessionId.delete(existingToolSessionId);
		}
		this._terminalInstancesByToolSessionId.set(terminalToolSessionId, instance);
		this._toolSessionIdByTerminalInstance.set(instance, terminalToolSessionId);
		this._terminalInstanceListenersByToolSessionId.set(terminalToolSessionId, instance.onDisposed(() => {
			this._terminalInstancesByToolSessionId.delete(terminalToolSessionId);
			this._toolSessionIdByTerminalInstance.delete(instance);
			this._terminalInstanceListenersByToolSessionId.deleteAndDispose(terminalToolSessionId);
		}));
		this._onDidRegisterTerminalInstanceWithToolSession.fire(instance);
	}

	async getTerminalInstanceByToolSessionId(terminalToolSessionId: string): Promise<ITerminalInstance | undefined> {
		return this._terminalInstancesByToolSessionId.get(terminalToolSessionId);
	}

	getToolSessionTerminalInstances(): readonly ITerminalInstance[] {
		return Array.from(new Set(this._terminalInstancesByToolSessionId.values()));
	}

	getToolSessionIdForInstance(instance: ITerminalInstance): string | undefined {
		return this._toolSessionIdByTerminalInstance.get(instance);
	}

	registerTerminalInstanceWithChatSession(chatSessionResource: URI, instance: ITerminalInstance): void {
		this._chatSessionResourceByTerminalInstance.set(instance, chatSessionResource);
	}

	getChatSessionResourceForInstance(instance: ITerminalInstance): URI | undefined {
		return this._chatSessionResourceByTerminalInstance.get(instance);
	}

	isBackgroundTerminal(): boolean {
		return false;
	}

	registerProgressPart(part: IChatTerminalToolProgressPart): IDisposable {
		this._progressParts.add(part);
		this._mostRecentProgressPart = part;
		return toDisposable(() => {
			this._progressParts.delete(part);
			if (this._focusedProgressPart === part) {
				this._focusedProgressPart = undefined;
			}
			if (this._mostRecentProgressPart === part) {
				this._mostRecentProgressPart = Array.from(this._progressParts).at(-1);
			}
		});
	}

	setFocusedProgressPart(part: IChatTerminalToolProgressPart): void {
		this._focusedProgressPart = part;
	}

	clearFocusedProgressPart(part: IChatTerminalToolProgressPart): void {
		if (this._focusedProgressPart === part) {
			this._focusedProgressPart = undefined;
		}
	}

	getFocusedProgressPart(): IChatTerminalToolProgressPart | undefined {
		return this._focusedProgressPart;
	}

	getMostRecentProgressPart(): IChatTerminalToolProgressPart | undefined {
		return this._mostRecentProgressPart;
	}

	setChatSessionAutoApproval(chatSessionResource: URI, enabled: boolean): void {
		const key = chatSessionResource.toString();
		if (enabled) {
			this._sessionAutoApproval.add(key);
		} else {
			this._sessionAutoApproval.delete(key);
		}
	}

	hasChatSessionAutoApproval(chatSessionResource: URI): boolean {
		return this._sessionAutoApproval.has(chatSessionResource.toString());
	}

	addSessionAutoApproveRule(chatSessionResource: URI, key: string, value: boolean | { approve: boolean; matchCommandLine?: boolean }): void {
		const resourceKey = chatSessionResource.toString();
		let rules = this._sessionAutoApproveRules.get(resourceKey);
		if (!rules) {
			rules = {};
			this._sessionAutoApproveRules.set(resourceKey, rules);
		}
		rules[key] = value;
	}

	getSessionAutoApproveRules(chatSessionResource: URI): Readonly<Record<string, boolean | { approve: boolean; matchCommandLine?: boolean }>> {
		return this._sessionAutoApproveRules.get(chatSessionResource.toString()) ?? {};
	}

	continueInBackground(terminalToolSessionId: string): void {
		this._onDidContinueInBackground.fire(terminalToolSessionId);
	}

	registerAhpCommandSource(terminalToolSessionId: string, source: IAhpTerminalCommandSource): IDisposable {
		this._ahpCommandSources.set(terminalToolSessionId, source);
		return toDisposable(() => {
			if (this._ahpCommandSources.get(terminalToolSessionId) === source) {
				this._ahpCommandSources.delete(terminalToolSessionId);
			}
		});
	}

	getAhpCommandSource(terminalToolSessionId: string): IAhpTerminalCommandSource | undefined {
		return this._ahpCommandSources.get(terminalToolSessionId);
	}
}

class TurboFileChatWidgetService implements IChatWidgetService {
	declare _serviceBrand: undefined;

	readonly lastFocusedWidget: IChatWidget | undefined = undefined;
	readonly onDidAddWidget: Event<IChatWidget> = Event.None;
	readonly onDidBackgroundSession: Event<URI> = Event.None;
	readonly onDidChangeFocusedWidget: Event<IChatWidget | undefined> = Event.None;
	readonly onDidChangeFocusedSession: Event<void> = Event.None;

	async reveal(): Promise<boolean> {
		return false;
	}

	async revealWidget(): Promise<IChatWidget | undefined> {
		return undefined;
	}

	getAllWidgets(): ReadonlyArray<IChatWidget> {
		return [];
	}

	getWidgetByInputUri(): IChatWidget | undefined {
		return undefined;
	}

	async openSession(): Promise<IChatWidget | undefined> {
		return undefined;
	}

	getWidgetBySessionResource(): IChatWidget | undefined {
		return undefined;
	}

	getWidgetsByLocations(_location: ChatAgentLocation): ReadonlyArray<IChatWidget> {
		return [];
	}

	register(): IDisposable {
		return toDisposable(() => { });
	}
}

registerSingleton(ITerminalChatService, TurboFileTerminalChatService, InstantiationType.Delayed);
registerSingleton(IChatContextPickService, ChatContextPickService, InstantiationType.Delayed);
registerSingleton(IChatWidgetService, TurboFileChatWidgetService, InstantiationType.Delayed);
