/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('TurboFileDirectoryNavigation', () => {
	const editorPath = () => path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts');
	const readEditor = () => fs.readFileSync(editorPath(), 'utf8');
	const methodBlock = (source: string, start: string, end: string): string => {
		const startIndex = source.indexOf(start);
		const endIndex = source.indexOf(end, startIndex);
		assert.ok(startIndex >= 0, `${start} should exist`);
		assert.ok(endIndex > startIndex, `${end} should follow ${start}`);
		return source.slice(startIndex, endIndex);
	};

	test('ordinary path opens use the 1.124 fast refresh path', () => {
		const source = readEditor();
		const block = methodBlock(source, 'private async openPanePath', 'private async navigatePaneDirectory');

		assert.ok(block.includes('this.refreshPane(side, { path, force: true })'));
		assert.ok(!block.includes('this.navigatePaneDirectory(side, path)'));
	});

	test('double-click directory navigation uses the 1.124 fast loading state without delayed placeholder', () => {
		const source = readEditor();
		const block = methodBlock(source, 'private async navigatePaneDirectory', 'private renderFileList');

		assert.ok(block.includes('state.loading = true;'));
		assert.ok(block.includes('state.items = [];'));
		assert.ok(!block.includes('NAV_LOADING_PLACEHOLDER_DELAY_MS'));
	});

	test('file list does not render the blocking directory loading placeholder', () => {
		const source = readEditor();
		const loadingText = String.fromCharCode(27491, 22312, 21152, 36733, 30446, 24405);

		assert.ok(!source.includes(loadingText));
		assert.ok(!source.includes('NAV_LOADING_PLACEHOLDER_DELAY_MS'));
	});

	test('local directory navigation uses names-only listing when attributes are not needed', () => {
		const source = readEditor();
		const block = methodBlock(source, 'private async loadPaneDirectory', 'private async recoverMissingPanePath');

		assert.ok(block.includes('this.sshService.listLocalDirectoryNames(path, force)'));
		assert.ok(block.includes('this.sshService.listLocalDirectory(path, force)'));
	});

	test('loads complete remote attributes for foreground sorting and keeps background prefetch lightweight', () => {
		const source = readEditor();
		const load = methodBlock(source, 'private async loadPaneDirectory', 'private async recoverMissingPanePath');
		const prefetch = methodBlock(source, 'private prefetchPaneDirectory', 'private getPaneDirectoryCacheKey');

		assert.ok(load.includes("const loadsAttributes = needsAttributes || (isRemote && purpose === 'foreground');"));
		assert.ok(load.includes('? await this.sshService.listRemoteDirectory('));
		assert.ok(load.includes(': await this.sshService.listRemoteDirectoryNames('));
		assert.ok(prefetch.includes('this.prefetchPaneDirectoryNow(device, path, this.paneSortNeedsAttributes(side));'));
		assert.ok(prefetch.includes("intent === 'hover' && this.paneSortNeedsAttributes(side)"));
		assert.ok(prefetch.includes("await this.loadPaneDirectory(device, path, false, 'prefetch', needsAttributes)"));
		assert.ok(source.includes('this.enqueuePaneDirectoryPrefetch(device, path);'));
	});

	test('never displays or progressively re-sorts incomplete attribute listings', () => {
		const source = readEditor();
		const navigation = methodBlock(source, 'private async navigatePaneDirectory', 'private renderFileList');
		const enrich = methodBlock(source, 'private async enrichVisibleRows', 'private scheduleEnrichRetryIfNeeded');
		const setDevice = methodBlock(source, 'private setPaneDevice', 'private capturePaneSelectionForCurrentPage');

		assert.ok(source.includes('private paneListingSatisfiesSort'));
		assert.ok(source.includes('isTurboFileListingReadyForSort(items, this.paneStates[side].sortKey)'));
		assert.ok(navigation.includes('this.paneDirectoryEntrySatisfiesSort(side, cached)'));
		assert.ok(setDevice.includes('this.paneListingSatisfiesSort(side, snapshot.items)'));
		assert.ok(setDevice.includes('this.paneDirectoryEntrySatisfiesSort(side, cached)'));
		assert.ok(enrich.includes('if (this.paneSortNeedsAttributes(side))'));
		assert.ok(!enrich.includes('state.items = this.sortPaneItems(side, state.items);'));
	});

	test('remote directory listing uses the reused SFTP session path from 1.124', () => {
		const servicePath = path.join(process.cwd(), 'src/vs/platform/turbofile/electron-main/turbofileSshMainService.ts');
		const source = fs.readFileSync(servicePath, 'utf8');
		const block = methodBlock(source, 'private async listRemoteDirectoryCore', 'private createRemoteDirectoryListingResult');

		assert.ok(block.includes('this.getDirectorySftpSession(options, configResult.config)'));
		assert.ok(block.includes('this.readRemoteDirectoryWithFallback(session.sftp, session.client, options, path, namesOnly)'));
		assert.ok(!block.includes('readRemoteDirectoryWithFreshFastClient'));
	});
});
