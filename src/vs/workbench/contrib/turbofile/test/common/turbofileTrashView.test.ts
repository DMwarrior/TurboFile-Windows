/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ITurboFileTrashItem } from '../../../../../platform/turbofile/common/turbofile.js';
import { enterTurboFileTrashDirectory, enterTurboFileTrashView, getTurboFileTrashRowHeight, isTurboFileTrashBrowsePathAllowed, isTurboFileTrashRootView, leaveTurboFileTrashDirectory, leaveTurboFileTrashView, mapTurboFileTrashItemsToRows } from '../../common/turbofileTrashView.js';

suite('TurboFileTrashView', function () {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('remembers the directory to restore when one pane enters the recycle bin', () => {
		assert.deepStrictEqual(enterTurboFileTrashView('D:\\Work\\left'), {
			active: true,
			returnPath: 'D:\\Work\\left'
		});
	});

	test('leaves recycle-bin mode without retaining another pane path', () => {
		assert.deepStrictEqual(leaveTurboFileTrashView(), {
			active: false
		});
	});

	test('keeps directory browsing inside one deleted payload root', () => {
		const item = {
			id: 'folder',
			originalName: 'images',
			originalPath: '/data/images',
			deletedAt: 2,
			type: 'directory',
			volumeId: '/',
			trashRoot: '/.Trash-1000/turbofile',
			payloadPath: '/.Trash-1000/turbofile/files/folder',
			deviceIdentity: 'ssh:nas:22:user'
		} as ITurboFileTrashItem;
		const root = enterTurboFileTrashView('/data');
		const browsing = enterTurboFileTrashDirectory(root, item, `${item.payloadPath}/nested`);

		assert.deepStrictEqual({
			rootView: isTurboFileTrashRootView(root),
			browsingRootView: isTurboFileTrashRootView(browsing),
			rootRowHeight: getTurboFileTrashRowHeight(root),
			browsingRowHeight: getTurboFileTrashRowHeight(browsing),
			posixRoot: isTurboFileTrashBrowsePathAllowed(item.payloadPath, item.payloadPath, false),
			posixChild: isTurboFileTrashBrowsePathAllowed(item.payloadPath, `${item.payloadPath}/nested`, false),
			posixEscape: isTurboFileTrashBrowsePathAllowed(item.payloadPath, '/.Trash-1000/turbofile/files/other', false),
			windowsChild: isTurboFileTrashBrowsePathAllowed('D:\\.trash\\files\\A', 'd:/.trash/files/A/nested', true),
			windowsSibling: isTurboFileTrashBrowsePathAllowed('D:\\.trash\\files\\A', 'D:\\.trash\\files\\AB', true),
			backAtRoot: leaveTurboFileTrashDirectory(browsing)
		}, {
			rootView: true,
			browsingRootView: false,
			rootRowHeight: 30,
			browsingRowHeight: 30,
			posixRoot: true,
			posixChild: true,
			posixEscape: false,
			windowsChild: true,
			windowsSibling: false,
			backAtRoot: root
		});
	});

	test('maps metadata to newest-first rows without a parent item', () => {
		const items = [
			{
				id: 'old',
				originalName: 'old-folder',
				originalPath: '/data/old-folder',
				deletedAt: 1,
				type: 'directory',
				volumeId: '/',
				trashRoot: '/.Trash-1000/turbofile',
				payloadPath: '/.Trash-1000/turbofile/files/old',
				deviceIdentity: 'ssh:nas:22:user'
			},
			{
				id: 'new',
				originalName: 'new.jpg',
				originalPath: '/data/new.jpg',
				deletedAt: 2,
				type: 'file',
				knownSize: 10,
				volumeId: '/',
				trashRoot: '/.Trash-1000/turbofile',
				payloadPath: '/.Trash-1000/turbofile/files/new',
				deviceIdentity: 'ssh:nas:22:user'
			}
		] as ITurboFileTrashItem[];

		assert.deepStrictEqual(mapTurboFileTrashItemsToRows(items).map(row => ({
			id: row.id,
			name: row.name,
			originalPath: row.originalPath,
			knownSize: row.knownSize,
			directory: row.directory,
			parent: row.parent,
			rawSize: row.rawSize,
			rawModified: row.rawModified
		})), [
			{
				id: 'new',
				name: 'new.jpg',
				originalPath: '/data/new.jpg',
				knownSize: 10,
				directory: false,
				parent: false,
				rawSize: 10,
				rawModified: 2
			},
			{
				id: 'old',
				name: 'old-folder',
				originalPath: '/data/old-folder',
				knownSize: undefined,
				directory: true,
				parent: false,
				rawSize: 0,
				rawModified: 1
			}
		]);
	});
});
