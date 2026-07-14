/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


// #######################################################################
// ###                                                                 ###
// ### !!! PLEASE ADD COMMON IMPORTS INTO WORKBENCH.COMMON.MAIN.TS !!! ###
// ###                                                                 ###
// #######################################################################

//#region --- workbench common

import './workbench.common.main.js';

//#endregion


//#region --- workbench (desktop main)

import './electron-browser/desktop.main.js';
import './electron-browser/desktop.contribution.js';

//#endregion


//#region --- workbench parts

import './electron-browser/parts/dialogs/dialog.contribution.js';

//#endregion


//#region --- workbench services

import './services/textfile/electron-browser/nativeTextFileService.js';
import './services/dialogs/electron-browser/fileDialogService.js';
import './services/workspaces/electron-browser/workspacesService.js';
import './services/menubar/electron-browser/menubarService.js';
import './services/update/electron-browser/updateService.js';
import './services/url/electron-browser/urlService.js';
import './services/lifecycle/electron-browser/lifecycleService.js';
import './services/title/electron-browser/titleService.js';
import './services/host/electron-browser/nativeHostService.js';
import '../platform/meteredConnection/electron-browser/meteredConnectionService.js';
import './services/request/electron-browser/requestService.js';
import './services/clipboard/electron-browser/clipboardService.js';
import './services/contextmenu/electron-browser/contextmenuService.js';
import './services/workspaces/electron-browser/workspaceEditingService.js';
import './services/configurationResolver/electron-browser/configurationResolverService.js';
import './services/accessibility/electron-browser/accessibilityService.js';
import './services/keybinding/electron-browser/nativeKeyboardLayout.js';
import './services/path/electron-browser/pathService.js';
import './services/themes/electron-browser/nativeHostColorSchemeService.js';
import './services/extensionManagement/electron-browser/extensionManagementService.js';
import './services/mcp/electron-browser/mcpGalleryManifestService.js';
import './services/mcp/electron-browser/mcpWorkbenchManagementService.js';
import './services/encryption/electron-browser/encryptionService.js';
import './services/imageResize/electron-browser/imageResizeService.js';
import './services/secrets/electron-browser/secretStorageService.js';
import './services/turbofile/electron-browser/turbofileSshService.js';
import './services/localization/electron-browser/languagePackService.js';
import './services/telemetry/electron-browser/telemetryService.js';
import './services/extensions/electron-browser/extensionHostStarter.js';
import './services/extensions/electron-browser/nativeExtensionService.js';
import '../platform/extensionResourceLoader/common/extensionResourceLoaderService.js';
import './services/localization/electron-browser/localeService.js';
import './services/extensions/electron-browser/extensionsScannerService.js';
import './services/extensionManagement/electron-browser/extensionManagementServerService.js';
import './services/extensionManagement/electron-browser/extensionGalleryManifestService.js';
import './services/extensionManagement/electron-browser/extensionTipsService.js';
import './services/userDataSync/electron-browser/userDataSyncService.js';
import './services/userDataSync/electron-browser/userDataAutoSyncService.js';
import './services/timer/electron-browser/timerService.js';
import './services/environment/electron-browser/shellEnvironmentService.js';
import './services/integrity/electron-browser/integrityService.js';
import './services/workingCopy/electron-browser/workingCopyBackupService.js';
import './services/checksum/electron-browser/checksumService.js';
import '../platform/remote/electron-browser/sharedProcessTunnelService.js';
import './services/tunnel/electron-browser/tunnelService.js';
import '../platform/telemetry/electron-browser/customEndpointTelemetryService.js';
import './services/files/electron-browser/elevatedFileService.js';
import './services/search/electron-browser/searchService.js';
import './services/workingCopy/electron-browser/workingCopyHistoryService.js';
import './services/userDataSync/browser/userDataSyncEnablementService.js';
import '../platform/userDataProfile/electron-browser/userDataProfileStorageService.js';
import './services/auxiliaryWindow/electron-browser/auxiliaryWindowService.js';
import '../platform/extensionManagement/electron-browser/extensionsProfileScannerService.js';
import '../platform/sandbox/electron-browser/sandboxHelperService.js';
import '../platform/webContentExtractor/electron-browser/webContentExtractorService.js';
import './services/process/electron-browser/processService.js';
import './services/power/electron-browser/powerService.js';

import { registerSingleton } from '../platform/instantiation/common/extensions.js';
import { IUserDataInitializationService, UserDataInitializationService } from './services/userData/browser/userDataInit.js';
import { SyncDescriptor } from '../platform/instantiation/common/descriptors.js';

registerSingleton(IUserDataInitializationService, new SyncDescriptor(UserDataInitializationService, [[]], true));


//#endregion


//#region --- workbench contributions

// Logs
import './contrib/logs/electron-browser/logs.contribution.js';

// TurboFile slim shell: Language pack marketplace UI is intentionally disabled.

// Explorer
import './contrib/files/electron-browser/fileActions.contribution.js';

// CodeEditor Contributions
import './contrib/codeEditor/electron-browser/codeEditor.contribution.js';

// TurboFile slim shell: Debug and Extensions Management contributions are intentionally disabled.

// TurboFile slim shell: VS Code Remote UI is intentionally disabled.

// Terminal
import './contrib/terminal/electron-browser/terminal.contribution.js';

// TurboFile
import './contrib/turbofile/browser/turbofile.contribution.js';

// Themes
import './contrib/themes/browser/themes.test.contribution.js';
import './services/themes/electron-browser/themes.contribution.js';
// User Data Sync

// TurboFile slim shell: VS Code Tasks service is intentionally disabled.

// External terminal
import './contrib/externalTerminal/electron-browser/externalTerminal.contribution.js';

// Webview
import './contrib/webview/electron-browser/webview.contribution.js';

// TurboFile slim shell: Browser View UI is intentionally disabled.

// Splash
import './contrib/splash/electron-browser/splash.contribution.js';

// Local History
import './contrib/localHistory/electron-browser/localHistory.contribution.js';

// Merge Editor
import './contrib/mergeEditor/electron-browser/mergeEditor.contribution.js';

// TurboFile slim shell: Multi Diff Editor UI is intentionally disabled.

// TurboFile slim shell: Remote Tunnel UI is intentionally disabled.

// TurboFile slim shell: Chat contributions are intentionally disabled.

// Encryption
import './contrib/encryption/electron-browser/encryption.contribution.js';

// TurboFile slim shell: MCP contributions are intentionally disabled.

//#endregion


export { main } from './electron-browser/desktop.main.js';
