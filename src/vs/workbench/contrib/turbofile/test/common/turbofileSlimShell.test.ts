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

	test('does not register workbench features outside TurboFile and document workflows', () => {
		const commonMain = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/workbench.common.main.ts'), 'utf8');
		const desktopMain = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/workbench.desktop.main.ts'), 'utf8');
		const entrypoints = `${commonMain}\n${desktopMain}`;
		const forbiddenImports = [
			'contrib/authentication',
			'contrib/debug/electron-browser/extensionHostDebugService',
			'contrib/emergencyAlert',
			'contrib/issue',
			'contrib/keybindingsExport',
			'contrib/performance/electron-browser',
			'contrib/policyExport',
			'contrib/processExplorer',
			'contrib/share',
			'contrib/speech',
			'contrib/tags',
			'contrib/telemetry',
			'contrib/userDataProfile',
			'contrib/userDataSync',
			'platform/agentHost',
			'platform/diagnostics',
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
});
