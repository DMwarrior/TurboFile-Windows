/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('TurboFileRendererBatchHotPath', () => {
	const readEditor = () => fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileEditor.ts'), 'utf8');

	test('resolves SSH credentials once for an entire recycle-bin batch', () => {
		const editor = readEditor();
		const moveStart = editor.indexOf('private async moveUserItemsToTrash');
		const trashDeviceStart = editor.indexOf('private async toTrashDevice', moveStart);
		const moveUserItemsToTrash = editor.slice(moveStart, trashDeviceStart);
		const toTrashDevice = editor.slice(trashDeviceStart, editor.indexOf('private async toggleTrashView', trashDeviceStart));
		const toTransferEndpointStart = editor.indexOf('private async toTransferEndpoint');
		const toTransferEndpoint = editor.slice(toTransferEndpointStart, editor.indexOf('private async getSshConnectionOptions', toTransferEndpointStart));

		assert.strictEqual((moveUserItemsToTrash.match(/getSshConnectionOptions\(device\)/g) ?? []).length, 1);
		assert.ok(moveUserItemsToTrash.includes('this.toTransferEndpoint(device, item.path!, connection)'));
		assert.ok(moveUserItemsToTrash.includes('this.toTrashDevice(device, connection)'));
		assert.ok(toTrashDevice.includes('connection?: ITurboFileSshConnectionOptions'));
		assert.ok(toTrashDevice.includes('connection: connection ?? await this.getSshConnectionOptions(device)'));
		assert.ok(toTransferEndpoint.includes('connection?: ITurboFileSshConnectionOptions'));
		assert.ok(toTransferEndpoint.includes('connection: connection ?? await this.getSshConnectionOptions(device)'));
	});

	test('keeps the live batch title summary O(1) per task', () => {
		const editor = readEditor();
		const taskInterface = editor.slice(editor.indexOf('interface TurboFileTask {'), editor.indexOf('interface TurboFileTransferExecutionResult'));
		const titleStart = editor.indexOf('private getLiveTransferStatusTitle');
		const title = editor.slice(titleStart, editor.indexOf('private getLiveTransferItems', titleStart));
		const progressStart = editor.indexOf('private updateTransferProgress');
		const progress = editor.slice(progressStart, editor.indexOf('private calculateTransferSpeed', progressStart));

		assert.ok(taskInterface.includes('currentTransferName?: string;'));
		assert.ok(title.includes('currentTransferName'));
		assert.ok(title.includes('task.activeTransferItemIndex !== undefined ? fallbackName : task.currentTransferName'));
		assert.ok(!title.includes('.flatMap('));
		assert.ok(!title.includes('.map('));
		assert.ok(!title.includes('.find('));
		assert.ok(progress.includes('task.currentTransferName = event.currentName'));
	});

	test('uses explicit terminal state instead of treating every complete phase as success', () => {
		const editor = readEditor();
		const progressStart = editor.indexOf('private updateTransferProgress');
		const progress = editor.slice(progressStart, editor.indexOf('private calculateTransferSpeed', progressStart));

		assert.ok(progress.includes("const isFailed = event.state === 'failed'"));
		assert.ok(progress.includes("const isCanceled = event.state === 'canceled'"));
		assert.ok(progress.includes("event.state ? event.state === 'completed' : event.phase === 'complete'"));
		assert.ok(progress.includes("activeItem.status = isCompleted ? 'success' : isFailed ? 'error' : isCanceled ? 'canceled' : 'running'"));
	});

	test('starts native batch transfers with a taskbar-only refresh', () => {
		const editor = readEditor();
		const batchStart = editor.indexOf('private async transferItemsBatch');
		const batch = editor.slice(batchStart, editor.indexOf('private async refreshTransferPanes', batchStart));
		const dragOutStart = editor.indexOf("const task = this.beginTask('transfer', `拖出 ${items.length} 项`");
		const dragOut = editor.slice(dragOutStart, editor.indexOf('private async transferItems(', dragOutStart));

		assert.ok(batch.includes('this.updateTask(task, `正在批量传输 0/${items.length}`, 8, false);'));
		assert.ok(dragOut.includes('this.updateTask(task, `正在拖出到 Windows 0/${items.length}`, 8, false);'));
	});

	test('groups external Windows paths by parent and bounds directory listing concurrency', () => {
		const editor = readEditor();
		const transferStart = editor.indexOf('private async transferExternalPaths');
		const transfer = editor.slice(transferStart, editor.indexOf('private async transferItemsToWindowsDirectory', transferStart));
		const resolverStart = editor.indexOf('private async resolveExternalTransferItems');
		const resolver = editor.slice(resolverStart, editor.indexOf('private async transferItemsToWindowsDirectory', resolverStart));

		assert.ok(transfer.includes('this.resolveExternalTransferItems(normalizedSourcePaths)'));
		assert.ok(!transfer.includes('Promise.all(normalizedSourcePaths.map'));
		assert.strictEqual((resolver.match(/listLocalDirectory\(group\.parentPath\)/g) ?? []).length, 1);
		assert.ok(resolver.includes('const groupsByParent = new Map'));
		assert.ok(resolver.includes('const entriesByPath = new Map'));
		assert.ok(resolver.includes('const entriesByName = new Map'));
		assert.ok(resolver.includes('EXTERNAL_PATH_PARENT_LIST_CONCURRENCY'));
		assert.ok(resolver.includes('await Promise.all(workers)'));
	});

	test('resolves SSH credentials once for same-pane move and recycle-bin browse delete batches', () => {
		const editor = readEditor();
		const moveStart = editor.indexOf('private async moveSelectedItemsIntoDirectory');
		const move = editor.slice(moveStart, editor.indexOf('private async moveInternalItemsNatively', moveStart));
		const deleteStart = editor.indexOf('private async permanentlyDeleteTrashBrowseItems');
		const deleteBatch = editor.slice(deleteStart, editor.indexOf('private setImageGridSortDirection', deleteStart));

		assert.strictEqual((move.match(/getSshConnectionOptions\(device\)/g) ?? []).length, 1);
		assert.ok(move.includes('this.toTransferEndpoint(device, item.path!, connection)'));
		assert.strictEqual((deleteBatch.match(/getSshConnectionOptions\(device\)/g) ?? []).length, 1);
		assert.ok(deleteBatch.includes('this.toTransferEndpoint(device, item.path!, connection)'));
	});

	test('indexes batch failure messages once instead of scanning failures for every item', () => {
		const editor = readEditor();
		const dragStart = editor.indexOf('private async transferItemsToWindowsDirectory');
		const drag = editor.slice(dragStart, editor.indexOf('private async transferSelected', dragStart));
		const batchStart = editor.indexOf('private async transferItemsBatch');
		const batch = editor.slice(batchStart, editor.indexOf('private async refreshTransferPanes', batchStart));

		for (const hotPath of [drag, batch]) {
			assert.ok(hotPath.includes('const failureMessages = new Map'));
			assert.ok(hotPath.includes('failureMessages.get('));
			assert.ok(!hotPath.includes('result.failures.find('));
		}
	});

	test('routes even a single move through the batch transaction', () => {
		const editor = readEditor();
		const transferStart = editor.indexOf('private async transferSelected');
		const transfer = editor.slice(transferStart, editor.indexOf('private async transferItemsBatch', transferStart));
		const helperStart = editor.indexOf('function shouldUseBatchTransfer');
		const helper = editor.slice(helperStart, editor.indexOf('\n}', helperStart) + 2);

		assert.ok(transfer.includes('shouldUseBatchTransfer(operation, sourceItems.length)'));
		assert.ok(helper.includes("operation === 'move' || itemCount > 1"));
	});

	test('indexes recycle-bin restore conflicts instead of scanning every selected item', () => {
		const editor = readEditor();
		const restoreStart = editor.indexOf('private async restoreSelectedTrashItems');
		const restore = editor.slice(restoreStart, editor.indexOf('private async refreshVisibleRestoredDirectories', restoreStart));

		assert.ok(restore.includes('const itemsById = new Map'));
		assert.ok(restore.includes('itemsById.get(item.id)'));
		assert.ok(!restore.includes('items.find(candidate => candidate.id === item.id)'));
	});
});
