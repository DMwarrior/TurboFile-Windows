/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ITurboFileTrashItem } from '../../common/turbofile.js';
import { createTurboFileKeepBothName, getTurboFileTrashDeviceIdentity, isTurboFileProtectedTrashSource, sortTurboFileTrashItems } from '../../common/turbofileTrash.js';

suite('TurboFileTrash', function () {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps SSH identities stable while separating users', () => {
		assert.deepStrictEqual([
			getTurboFileTrashDeviceIdentity({
				kind: 'ssh',
				connection: { host: 'NAS.local', port: 22, username: 'alice' }
			}),
			getTurboFileTrashDeviceIdentity({
				kind: 'ssh',
				connection: { host: 'nas.LOCAL', port: 22, username: 'bob' }
			})
		], [
			'ssh:nas.local:22:alice',
			'ssh:nas.local:22:bob'
		]);
	});

	test('uses a stable identity for the local Windows user', () => {
		assert.strictEqual(getTurboFileTrashDeviceIdentity({
			kind: 'local',
			localUserIdentity: 'DOMAIN\\Alice'
		}), 'local:domain\\alice');
	});

	test('creates keep-both names before the final extension', () => {
		assert.deepStrictEqual([
			createTurboFileKeepBothName('photo.jpg', 1),
			createTurboFileKeepBothName('archive.tar.gz', 2),
			createTurboFileKeepBothName('folder', 3),
			createTurboFileKeepBothName('.env', 4)
		], [
			'photo (1).jpg',
			'archive.tar (2).gz',
			'folder (3)',
			'.env (4)'
		]);
	});

	test('sorts newest deletion first without mutating the source array', () => {
		const items = [
			{ id: 'old', deletedAt: 1 },
			{ id: 'new', deletedAt: 2 },
			{ id: 'middle', deletedAt: 1.5 }
		] as ITurboFileTrashItem[];

		assert.deepStrictEqual({
			sorted: sortTurboFileTrashItems(items).map(item => item.id),
			original: items.map(item => item.id)
		}, {
			sorted: ['new', 'middle', 'old'],
			original: ['old', 'new', 'middle']
		});
	});

	test('protects filesystem roots and the recycle-bin namespace', () => {
		assert.deepStrictEqual([
			isTurboFileProtectedTrashSource('/', false),
			isTurboFileProtectedTrashSource('C:\\', true),
			isTurboFileProtectedTrashSource('D:\\data', true),
			isTurboFileProtectedTrashSource('/mnt/data/.Trash-1000/turbofile/files/a', false),
			isTurboFileProtectedTrashSource('C:\\.turbofile-trash-alice\\turbofile\\files\\a', true)
		], [
			true,
			true,
			false,
			true,
			true
		]);
	});
});
