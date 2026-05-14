/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { joinPath } from '../../../../base/common/resources.js';
import Severity from '../../../../base/common/severity.js';
import { URI } from '../../../../base/common/uri.js';
import { INativeEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { ExtensionIdentifier, ExtensionType, IExtension, IExtensionContributions, IExtensionDescription, IExtensionManifest, TargetPlatform } from '../../../../platform/extensions/common/extensions.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkbenchExtensionManagementService } from '../../extensionManagement/common/extensionManagement.js';
import { ActivationKind, ExtensionActivationReason, ExtensionPointContribution, IExtensionInspectInfo, IExtensionService, IExtensionsStatus, IMessage, IResponsiveStateChangeEvent, IWillActivateEvent, WillStopExtensionHostsEvent, toExtensionDescription } from './extensions.js';
import { ExtensionHostKind } from './extensionHostKind.js';
import { ExtensionMessageCollector, ExtensionsRegistry, IExtensionPoint, IExtensionPointUser } from './extensionsRegistry.js';

const TURBOFILE_NATIVE_EDITOR_EXTENSION_POINTS = new Set([
	'configurationDefaults',
	'languages',
	'grammars',
	'jsonValidation',
	'semanticTokenTypes',
	'semanticTokenModifiers',
	'semanticTokenScopes',
	'snippets',
	'themes',
	'colors',
	'iconThemes',
	'productIconThemes'
]);

const hasOwnProperty = Object.hasOwnProperty;

export class TurboFileExtensionContributionService implements IExtensionService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidRegisterExtensions = new Emitter<void>();
	readonly onDidRegisterExtensions = this._onDidRegisterExtensions.event;

	readonly onDidChangeExtensionsStatus: Event<ExtensionIdentifier[]> = Event.None;

	private readonly _onDidChangeExtensions = new Emitter<{ readonly added: readonly IExtensionDescription[]; readonly removed: readonly IExtensionDescription[] }>();
	readonly onDidChangeExtensions = this._onDidChangeExtensions.event;

	readonly onWillActivateByEvent: Event<IWillActivateEvent> = Event.None;
	readonly onDidChangeResponsiveChange: Event<IResponsiveStateChangeEvent> = Event.None;
	readonly onWillStop: Event<WillStopExtensionHostsEvent> = Event.None;

	private _extensions: IExtensionDescription[] = [];
	private readonly _installedExtensionsRegistered: Promise<boolean>;

	get extensions(): readonly IExtensionDescription[] {
		return this._extensions;
	}

	constructor(
		@IWorkbenchExtensionManagementService private readonly extensionManagementService: IWorkbenchExtensionManagementService,
		@IFileService private readonly fileService: IFileService,
		@INativeEnvironmentService private readonly environmentService: INativeEnvironmentService,
		@ILogService private readonly logService: ILogService
	) {
		this._installedExtensionsRegistered = this.registerBuiltinLanguageContributions();
	}

	private async registerBuiltinLanguageContributions(): Promise<boolean> {
		try {
			const installedExtensions = await this.extensionManagementService.getInstalled(ExtensionType.System);
			const builtInExtensions = installedExtensions
				.map(extension => toExtensionDescription(extension))
				.filter(extension => this.hasNativeEditorContribution(extension));
			const vscodeUserExtensions = await this.scanVSCodeUserEditorContributions();
			this._extensions = this.dedupeExtensions([...builtInExtensions, ...vscodeUserExtensions]);

			this.acceptExtensionPointUsers();
			this._onDidChangeExtensions.fire({ added: this._extensions, removed: [] });
			this._onDidRegisterExtensions.fire();
			this.logService.trace(`TurboFile registered ${this._extensions.length} editor extension contributions, including ${vscodeUserExtensions.length} VS Code user contributions.`);
			return true;
		} catch (error) {
			this.logService.error('TurboFile failed to register built-in editor extension contributions', error);
			this._onDidRegisterExtensions.fire();
			return false;
		}
	}

	private async scanVSCodeUserEditorContributions(): Promise<IExtensionDescription[]> {
		const extensionsHome = joinPath(this.environmentService.userHome, '.vscode', 'extensions');
		let extensionsRoot;
		try {
			extensionsRoot = await this.fileService.resolve(extensionsHome);
		} catch (error) {
			this.logService.trace('TurboFile did not find VS Code user extensions to import.', error);
			return [];
		}

		const result: IExtensionDescription[] = [];
		for (const child of extensionsRoot.children ?? []) {
			if (!child.isDirectory || child.name.startsWith('.')) {
				continue;
			}
			const extension = await this.readVSCodeUserExtensionContribution(child.resource);
			if (extension) {
				result.push(extension);
			}
		}
		return result;
	}

	private async readVSCodeUserExtensionContribution(extensionLocation: URI): Promise<IExtensionDescription | undefined> {
		try {
			const packageResource = joinPath(extensionLocation, 'package.json');
			const packageContent = await this.fileService.readFile(packageResource);
			const manifest = JSON.parse(packageContent.value.toString()) as IExtensionManifest;
			if (!manifest.name || !manifest.publisher || !this.hasNativeEditorManifestContribution(manifest)) {
				return undefined;
			}
			return this.toUserExtensionDescription(manifest, extensionLocation);
		} catch (error) {
			this.logService.trace(`TurboFile skipped VS Code user extension at ${extensionLocation.toString()}.`, error);
			return undefined;
		}
	}

	private toUserExtensionDescription(manifest: IExtensionManifest, extensionLocation: URI): IExtensionDescription {
		const extension: IExtension = {
			type: ExtensionType.User,
			isBuiltin: false,
			identifier: { id: `${manifest.publisher}.${manifest.name}` },
			manifest,
			location: extensionLocation,
			targetPlatform: TargetPlatform.UNDEFINED,
			publisherDisplayName: manifest.publisher,
			isValid: true,
			validations: [],
			preRelease: false
		};
		return toExtensionDescription(extension);
	}

	private dedupeExtensions(extensions: IExtensionDescription[]): IExtensionDescription[] {
		const byId = new Map<string, IExtensionDescription>();
		for (const extension of extensions) {
			byId.set(extension.identifier.value.toLowerCase(), extension);
		}
		return [...byId.values()];
	}

	private hasNativeEditorContribution(extension: IExtensionDescription): boolean {
		if (!extension.contributes) {
			return false;
		}
		for (const extensionPointName of TURBOFILE_NATIVE_EDITOR_EXTENSION_POINTS) {
			if (hasOwnProperty.call(extension.contributes, extensionPointName)) {
				return true;
			}
		}
		return false;
	}

	private hasNativeEditorManifestContribution(manifest: IExtensionManifest): boolean {
		if (!manifest.contributes) {
			return false;
		}
		for (const extensionPointName of TURBOFILE_NATIVE_EDITOR_EXTENSION_POINTS) {
			if (hasOwnProperty.call(manifest.contributes, extensionPointName)) {
				return true;
			}
		}
		return false;
	}

	private acceptExtensionPointUsers(): void {
		const messageHandler = (message: IMessage) => this.handleExtensionPointMessage(message);
		for (const extensionPoint of ExtensionsRegistry.getExtensionPoints()) {
			if (!TURBOFILE_NATIVE_EDITOR_EXTENSION_POINTS.has(extensionPoint.name)) {
				continue;
			}

			const users: IExtensionPointUser<unknown>[] = [];
			for (const extension of this._extensions) {
				if (extension.contributes && hasOwnProperty.call(extension.contributes, extensionPoint.name)) {
					users.push({
						description: extension,
						value: extension.contributes[extensionPoint.name as keyof typeof extension.contributes],
						collector: new ExtensionMessageCollector(messageHandler, extension, extensionPoint.name)
					});
				}
			}
			(extensionPoint as IExtensionPoint<unknown> & { acceptUsers(users: IExtensionPointUser<unknown>[]): void }).acceptUsers(users);
		}
	}

	private handleExtensionPointMessage(message: IMessage): void {
		const formatted = `[${message.extensionId.value}]: ${message.message}`;
		if (message.type === Severity.Error) {
			this.logService.error(formatted);
		} else if (message.type === Severity.Warning) {
			this.logService.warn(formatted);
		} else {
			this.logService.info(formatted);
		}
	}

	activateByEvent(_activationEvent: string, _activationKind?: ActivationKind): Promise<void> {
		return Promise.resolve(undefined);
	}

	activateById(_extensionId: ExtensionIdentifier, _reason: ExtensionActivationReason): Promise<void> {
		return Promise.resolve(undefined);
	}

	activationEventIsDone(_activationEvent: string): boolean {
		return true;
	}

	whenInstalledExtensionsRegistered(): Promise<boolean> {
		return this._installedExtensionsRegistered;
	}

	async getExtension(id: string): Promise<IExtensionDescription | undefined> {
		await this._installedExtensionsRegistered;
		return this._extensions.find(extension => extension.identifier.value.toLowerCase() === id.toLowerCase());
	}

	canAddExtension(_extension: IExtensionDescription): boolean {
		return false;
	}

	canRemoveExtension(_extension: IExtensionDescription): boolean {
		return false;
	}

	async readExtensionPointContributions<T extends IExtensionContributions[keyof IExtensionContributions]>(extensionPoint: IExtensionPoint<T>): Promise<ExtensionPointContribution<T>[]> {
		await this._installedExtensionsRegistered;
		if (!TURBOFILE_NATIVE_EDITOR_EXTENSION_POINTS.has(extensionPoint.name)) {
			return [];
		}

		const result: ExtensionPointContribution<T>[] = [];
		for (const extension of this._extensions) {
			if (extension.contributes && hasOwnProperty.call(extension.contributes, extensionPoint.name)) {
				result.push(new ExtensionPointContribution<T>(extension, extension.contributes[extensionPoint.name as keyof typeof extension.contributes] as T));
			}
		}
		return result;
	}

	getExtensionsStatus(): { [id: string]: IExtensionsStatus } {
		return Object.create(null);
	}

	getInspectPorts(_extensionHostKind: ExtensionHostKind, _tryEnableInspector: boolean): Promise<IExtensionInspectInfo[]> {
		return Promise.resolve([]);
	}

	stopExtensionHosts(_reason: string, _auto?: boolean): Promise<boolean> {
		return Promise.resolve(true);
	}

	startExtensionHosts(_updates?: { readonly toAdd: readonly IExtension[]; readonly toRemove: readonly string[] }): Promise<void> {
		return Promise.resolve(undefined);
	}

	setRemoteEnvironment(_env: { [key: string]: string | null }): Promise<void> {
		return Promise.resolve(undefined);
	}

}
