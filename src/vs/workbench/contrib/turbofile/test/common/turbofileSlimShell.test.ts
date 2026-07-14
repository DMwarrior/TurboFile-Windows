/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

interface TurboFileProductPolicy {
	readonly excludedLocalExtensions: readonly string[];
	readonly excludedProductionDependencies: readonly string[];
	readonly electronLocales: readonly string[];
	readonly forbiddenDesktopEntrypoints: readonly string[];
	readonly forbiddenWorkbenchImports: readonly string[];
}

const requiredDocumentExtensions = [
	'css-language-features',
	'html-language-features',
	'json-language-features',
	'markdown-language-features',
	'notebook-renderers',
	'typescript-language-features'
];

suite('TurboFileSlimShell', () => {
	test('defines a packaging policy that preserves document and language capabilities', () => {
		const policyPath = path.join(process.cwd(), 'build/turbofile-product.json');
		const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8')) as TurboFileProductPolicy;

		assert.deepStrictEqual(policy.electronLocales, ['en-US.pak', 'zh-CN.pak']);
		assert.ok(policy.excludedLocalExtensions.includes('git'));
		assert.ok(policy.excludedLocalExtensions.includes('github-authentication'));
		assert.ok(policy.excludedProductionDependencies.includes('@github/copilot'));
		assert.ok(policy.forbiddenDesktopEntrypoints.includes('vs/sessions/'));
		assert.ok(policy.forbiddenWorkbenchImports.includes('services/browserView'));

		for (const extension of requiredDocumentExtensions) {
			assert.ok(!policy.excludedLocalExtensions.includes(extension), `${extension} must remain packaged`);
		}
	});

	test('uses the native extension service for default language intelligence', () => {
		const commonMain = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/workbench.common.main.ts'), 'utf8');
		const desktopMain = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/workbench.desktop.main.ts'), 'utf8');

		assert.ok(!commonMain.includes('TurboFileExtensionContributionService'));
		assert.ok(!commonMain.includes('registerSingleton(IExtensionService, TurboFileExtensionContributionService'));
		assert.ok(desktopMain.includes("import './services/extensions/electron-browser/nativeExtensionService.js';"));
	});

	test('registers startup dependencies for native web content extraction', () => {
		const electronMain = fs.readFileSync(path.join(process.cwd(), 'src/vs/code/electron-main/app.ts'), 'utf8');

		assert.ok(electronMain.includes('services.set(ITerminalSandboxService, new SyncDescriptor(NullTerminalSandboxService));'));
		assert.ok(electronMain.includes('services.set(IAgentNetworkFilterService, new SyncDescriptor(AgentNetworkFilterService, undefined, true));'));
		assert.ok(electronMain.includes('services.set(IWebContentExtractorService, new SyncDescriptor(NativeWebContentExtractorService'));
	});

	test('registers services required by extension hosts and retained document contributions', () => {
		const commonMain = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/workbench.common.main.ts'), 'utf8');
		const desktopMain = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/workbench.desktop.main.ts'), 'utf8');
		const extensionHostContribution = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/api/browser/extensionHost.contribution.ts'), 'utf8');
		const extensionHostApi = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/api/common/extHost.api.impl.ts'), 'utf8');
		const abstractTaskService = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/tasks/browser/abstractTaskService.ts'), 'utf8');
		const nativeTaskService = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/tasks/electron-browser/taskService.ts'), 'utf8');
		const optionalServices = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileSlimOptionalServices.ts'), 'utf8');
		const optionalExtensionHostCustomers = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/api/browser/mainThreadTurboFileOptionalServices.ts'), 'utf8');
		const notebookContribution = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/notebook/browser/notebook.contribution.ts'), 'utf8');
		const scmContribution = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/scm/browser/scm.contribution.ts'), 'utf8');
		const scmInput = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/scm/browser/scmInput.ts'), 'utf8');
		const mainThreadWebviewManager = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/api/browser/mainThreadWebviewManager.ts'), 'utf8');
		const anythingQuickAccess = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/search/browser/anythingQuickAccess.ts'), 'utf8');
		const symbolsQuickAccess = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/search/browser/symbolsQuickAccess.ts'), 'utf8');
		const searchActionsTopBar = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/search/browser/searchActionsTopBar.ts'), 'utf8');
		const searchContribution = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/search/browser/search.contribution.ts'), 'utf8');
		const searchIcons = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/search/browser/searchIcons.ts'), 'utf8');
		const searchFindInput = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/search/browser/searchFindInput.ts'), 'utf8');
		const searchView = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/search/browser/searchView.ts'), 'utf8');
		const searchResult = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/search/browser/searchTreeModel/searchResult.ts'), 'utf8');

		assert.ok(desktopMain.includes("import './contrib/debug/electron-browser/extensionHostDebugService.js';"));
		assert.ok(desktopMain.includes("import '../platform/diagnostics/electron-browser/diagnosticsService.js';"));
		assert.ok(commonMain.includes("import './contrib/speech/browser/speech.contribution.js';"));
		assert.ok(commonMain.includes('registerSingleton(IExtensionsWorkbenchService, ExtensionsWorkbenchService'));
		assert.ok(!commonMain.includes('registerSingleton(IChatAgentService, ChatAgentService'));
		assert.ok(!commonMain.includes('registerSingleton(IChatOutputRendererService, ChatOutputRendererService'));
		assert.ok(commonMain.includes("import './contrib/notebook/browser/notebook.contribution.js';"));
		assert.ok(commonMain.includes("import './contrib/interactive/browser/interactive.contribution.js';"));
		assert.ok(commonMain.includes("import './contrib/scm/browser/scm.service.contribution.js';"));
		assert.ok(commonMain.includes("import './contrib/scm/browser/quickDiff.contribution.js';"));
		assert.ok(commonMain.includes("import './contrib/tasks/browser/task.contribution.js';"));
		assert.ok(commonMain.includes("import './contrib/search/browser/search.contribution.js';"));
		assert.ok(commonMain.includes("import './contrib/searchEditor/browser/searchEditor.contribution.js';"));
		assert.ok(commonMain.includes("import './contrib/turbofile/browser/turbofileSlimOptionalServices.js';"));
		assert.ok(desktopMain.includes("import './contrib/tasks/electron-browser/taskService.js';"));
		assert.ok(extensionHostApi.includes('const extHostLanguageModelTools = rpcProtocol.set(ExtHostContext.ExtHostLanguageModelTools, {'));
		assert.ok(extensionHostContribution.includes("import './mainThreadTurboFileOptionalServices.js';"));
		assert.ok(extensionHostContribution.includes("import './mainThreadDebugService.js';"));
		assert.ok(!mainThreadWebviewManager.includes('MainThreadChatOutputRenderer'));
		assert.ok(!abstractTaskService.includes('@IChatService'));
		assert.ok(!abstractTaskService.includes('@IChatAgentService'));
		assert.ok(!abstractTaskService.includes('Fix with AI'));
		assert.ok(!nativeTaskService.includes('@IChatService'));
		assert.ok(!nativeTaskService.includes('@IChatAgentService'));
		assert.ok(!notebookContribution.includes("import './contrib/editorHint/emptyCellEditorHint.js';"));
		assert.ok(!notebookContribution.includes("import './contrib/cellDiagnostics/cellDiagnostics.js';"));
		assert.ok(!scmContribution.includes('SCMHistoryItemContextContribution'));
		assert.ok(!scmContribution.includes('Resolve Conflicts with AI'));
		assert.ok(!scmInput.includes('Generate Commit Message'));
		assert.ok(!anythingQuickAccess.includes('IQuickChatService'));
		assert.ok(!anythingQuickAccess.includes('IChatWidgetService'));
		assert.ok(!anythingQuickAccess.includes('ASK_QUICK_QUESTION_ACTION_ID'));
		assert.ok(!symbolsQuickAccess.includes('IChatWidgetService'));
		assert.ok(!symbolsQuickAccess.includes('ISymbolVariableEntry'));
		assert.ok(!searchActionsTopBar.includes('SearchWithAIAction'));
		assert.ok(!searchContribution.includes('semanticSearchBehavior'));
		assert.ok(!searchContribution.includes('keywordSuggestions'));
		assert.ok(!searchIcons.includes('search-sparkle'));
		assert.ok(!searchFindInput.includes('onDidChangeAIToggle'));
		assert.ok(!searchView.includes("from './AISearch/"));
		assert.ok(!searchResult.includes("from '../AISearch/"));
		assert.ok(optionalServices.includes('registerSingleton(IInlineChatSessionService, TurboFileNullInlineChatSessionService'));
		assert.ok(optionalServices.includes('registerSingleton(IChatEditingService, TurboFileNullChatEditingService'));
		assert.ok(optionalServices.includes('registerSingleton(IDebugService, NullDebugService'));
		assert.ok(optionalServices.includes('registerSingleton(IDebugVisualizerService, NullDebugVisualizerService'));
		assert.ok(optionalExtensionHostCustomers.includes('@extHostNamedCustomer(MainContext.MainThreadLanguageModels)'));
		assert.ok(optionalExtensionHostCustomers.includes('@extHostNamedCustomer(MainContext.MainThreadChatOutputRenderer)'));
		assert.ok(optionalExtensionHostCustomers.includes('MainContext.MainThreadChatAgents2'));
		assert.ok(optionalExtensionHostCustomers.includes('MainContext.MainThreadLanguageModelTools'));
		assert.ok(optionalExtensionHostCustomers.includes('MainContext.MainThreadChatSessions'));
		assert.ok(optionalExtensionHostCustomers.includes('MainContext.MainThreadAuthentication'));
		assert.ok(optionalExtensionHostCustomers.includes('throw new Error(`Unsupported TurboFile extension host method: ${String(property)}`)'));
		assert.ok(extensionHostApi.includes('getTools: () => []'));

		for (const removedParticipant of [
			'mainThreadLanguageModels',
			'mainThreadChatAgents2',
			'mainThreadChatCodeMapper',
			'mainThreadLanguageModelTools',
			'mainThreadEmbeddings',
			'mainThreadTesting',
			'mainThreadShare',
			'mainThreadAuthentication',
			'mainThreadAiRelatedInformation',
			'mainThreadAiEmbeddingVector',
			'mainThreadAiSettingsSearch',
			'mainThreadMcp',
			'mainThreadChatContext',
			'mainThreadChatStatus',
			'mainThreadChatInputNotification',
			'mainThreadChatDebug',
			'mainThreadChatOutputRenderer',
			'mainThreadChatSessions',
			'mainThreadGitExtensionService',
			'mainThreadBrowsers'
		]) {
			assert.ok(!extensionHostContribution.includes(`import './${removedParticipant}.js';`), `${removedParticipant} must not be registered`);
		}
	});

	test('does not register workbench features outside TurboFile and document workflows', () => {
		const commonMain = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/workbench.common.main.ts'), 'utf8');
		const desktopMain = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/workbench.desktop.main.ts'), 'utf8');
		const desktopContribution = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/electron-browser/desktop.contribution.ts'), 'utf8');
		const entrypoints = `${commonMain}\n${desktopMain}\n${desktopContribution}`;
		const forbiddenImports = [
			'contrib/authentication',
			'contrib/emergencyAlert',
			'contrib/issue',
			'contrib/keybindingsExport',
			'actions/openInAgentsAction',
			'contrib/performance/electron-browser',
			'contrib/policyExport',
			'contrib/processExplorer',
			'contrib/share',
			'contrib/tags',
			'contrib/telemetry',
			'contrib/userDataProfile',
			'contrib/userDataSync',
			'platform/agentHost',
			'platform/profiling',
			'platform/remoteTunnel',
			'services/aiEmbeddingVector',
			'services/aiRelatedInformation',
			'services/aiSettingsSearch',
			'services/browserView',
			'services/chat',
			'services/policies'
		];

		for (const forbiddenImport of forbiddenImports) {
			assert.ok(!entrypoints.includes(forbiddenImport), `${forbiddenImport} must not be registered`);
		}
	});

	test('does not bundle sessions, agent hosts, debug telemetry, or profiling workers', () => {
		const buildFiles = [
			'build/buildfile.ts',
			'build/next/index.ts',
			'build/gulpfile.vscode.ts',
			'build/gulpfile.vscode.web.ts',
			'build/lib/mangle/index.ts'
		].map(file => fs.readFileSync(path.join(process.cwd(), file), 'utf8')).join('\n');

		for (const forbiddenEntrypoint of [
			'vs/sessions/',
			'vs/platform/agentHost/',
			'vs/platform/browserView/',
			'vs/workbench/contrib/debug/node/telemetryApp',
			'vs/platform/profiling/electron-browser/profileAnalysisWorkerMain'
		]) {
			assert.ok(!buildFiles.includes(forbiddenEntrypoint), `${forbiddenEntrypoint} must not be bundled`);
		}

		for (const requiredEntrypoint of [
			'vs/workbench/workbench.desktop.main',
			'vs/workbench/api/node/extensionHostProcess',
			'vs/platform/files/node/watcher/watcherMain',
			'vs/platform/terminal/node/ptyHostMain',
			'vs/workbench/contrib/notebook/common/services/notebookWebWorkerMain',
			'vs/workbench/services/search/worker/localFileSearchMain'
		]) {
			assert.ok(buildFiles.includes(requiredEntrypoint), `${requiredEntrypoint} must remain bundled`);
		}
	});

	test('removes source trees that are unreachable from retained TurboFile and document workflows', () => {
		for (const removedSourceTree of [
			'src/vs/sessions',
			'src/vs/platform/agentHost/browser',
			'src/vs/platform/agentHost/electron-browser',
			'src/vs/platform/agentHost/electron-main',
			'src/vs/platform/agentHost/node',
			'src/vs/platform/browserView/electron-browser',
			'src/vs/platform/browserView/electron-main',
			'src/vs/platform/browserView/node',
			'src/vs/server/node/serverAgentHostManager.ts',
			'src/vs/workbench/contrib/telemetry',
			'src/vs/workbench/services/browserView',
			'src/vs/workbench/test/browser/componentFixtures/sessions'
		]) {
			assert.ok(!fs.existsSync(path.join(process.cwd(), removedSourceTree)), `${removedSourceTree} must be deleted`);
		}
	});

	test('removes production dependencies that were exclusive to the deleted agent host runtime', () => {
		const rootPackage = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')) as { dependencies?: Record<string, string> };
		for (const removedDependency of [
			'@microsoft/dev-tunnels-connections',
			'@microsoft/dev-tunnels-contracts',
			'@microsoft/dev-tunnels-management',
			'@microsoft/dev-tunnels-ssh',
			'@microsoft/dev-tunnels-ssh-tcp'
		]) {
			assert.ok(!rootPackage.dependencies?.[removedDependency], `${removedDependency} must be removed from root dependencies`);
		}
	});

	test('applies the TurboFile policy to packaged extensions, dependencies, maps, locales, and installer compression', () => {
		const extensionBuild = fs.readFileSync(path.join(process.cwd(), 'build/lib/extensions.ts'), 'utf8');
		const desktopPackaging = fs.readFileSync(path.join(process.cwd(), 'build/gulpfile.vscode.ts'), 'utf8');
		const installer = fs.readFileSync(path.join(process.cwd(), 'build/win32/code.iss'), 'utf8');

		assert.ok(extensionBuild.includes('turbofile-product.json'));
		assert.ok(extensionBuild.includes('excludedLocalExtensions'));
		assert.ok(extensionBuild.includes("filter(script => !excludedLocalExtensions.has(script.split('/')[0]))"));
		assert.ok(desktopPackaging.includes('excludedProductionDependencies'));
		assert.ok(desktopPackaging.includes('electronLocales'));
		assert.ok(desktopPackaging.includes('const stripSourceMapsInPackagingTasks = true;'));
		assert.ok(desktopPackaging.includes("'!**/*.map'"));
		assert.ok(installer.includes('Compression=lzma2/ultra64'));
		assert.ok(installer.includes('SolidCompression=yes'));
	});

	test('only removes validated legacy versioned resource directories after installation', () => {
		const installer = fs.readFileSync(path.join(process.cwd(), 'build/win32/code.iss'), 'utf8');

		assert.ok(installer.includes('procedure CleanupLegacyVersionedResources();'));
		assert.ok(installer.includes('Length(DirectoryName) <> 10'));
		assert.ok(installer.includes("FileExists(LegacyPath + '\\version')"));
		assert.ok(installer.includes("FileExists(LegacyPath + '\\resources\\app\\product.json')"));
		assert.ok(installer.includes("DirectoryName <> '{#VersionedResourcesFolder}'"));
		assert.ok(installer.includes('DelTree(LegacyPath, True, True, True)'));
		assert.ok(installer.includes('CleanupLegacyVersionedResources();'));
	});
});
