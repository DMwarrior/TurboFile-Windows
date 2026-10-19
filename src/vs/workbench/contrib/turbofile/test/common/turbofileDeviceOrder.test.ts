/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestSecretStorageService } from '../../../../../platform/secrets/test/common/testSecretStorageService.js';
import { InMemoryStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { TurboFileDeviceStore } from '../../browser/turbofileDeviceStore.js';
import { defaultTurboFileDeviceCapabilities, TurboFileDevice, TurboFileDevicePlatform } from '../../common/turbofileTypes.js';

function device(id: string, platform: TurboFileDevicePlatform = 'linux'): TurboFileDevice {
	return {
		id,
		name: id,
		host: '192.0.2.1',
		port: 22,
		username: 'test-user',
		authType: 'password',
		platform,
		capabilities: defaultTurboFileDeviceCapabilities,
		preferredTransferProtocol: 'auto-fast'
	};
}

suite('TurboFileDeviceOrder', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let storage: InMemoryStorageService;
	let secrets: TestSecretStorageService;
	let store: TurboFileDeviceStore;
	const windowsDevice = device('local-windows', 'windows');

	setup(() => {
		storage = disposables.add(new InMemoryStorageService());
		secrets = disposables.add(new TestSecretStorageService());
		storage.store('turbofile.devices', JSON.stringify([device('server-a'), device('server-b')]), StorageScope.PROFILE, StorageTarget.MACHINE);
		storage.store('turbofile.transferProtocolDefault.autoFast.v1', 'true', StorageScope.PROFILE, StorageTarget.MACHINE);
		store = disposables.add(new TurboFileDeviceStore(storage, secrets));
	});

	function allDeviceIds(deviceStore = store): string[] {
		return deviceStore.sortDevices([windowsDevice, ...deviceStore.loadDevices()]).map(device => device.id);
	}

	test('persists moves before and after Windows across store recreation', () => {
		const movedBefore = store.reorderDevice('server-b', 'local-windows', 'before');
		const movedAfter = store.reorderDevice('local-windows', 'server-a', 'after');
		const recreatedStore = disposables.add(new TurboFileDeviceStore(storage, secrets));

		assert.deepStrictEqual({
			movedBefore,
			movedAfter,
			current: allDeviceIds(),
			restored: allDeviceIds(recreatedStore),
			stored: JSON.parse(storage.get('turbofile.deviceOrder', StorageScope.PROFILE, '[]')),
			sshDevices: recreatedStore.loadDevices().map(device => device.id)
		}, {
			movedBefore: true,
			movedAfter: true,
			current: ['server-b', 'server-a', 'local-windows'],
			restored: ['server-b', 'server-a', 'local-windows'],
			stored: ['server-b', 'server-a', 'local-windows'],
			sshDevices: ['server-b', 'server-a']
		});
	});

	test('reordering does not rewrite device configuration or access credentials', async () => {
		storage.store('turbofile.devices', JSON.stringify([{ ...device('server-a'), preferredTransferProtocol: 'scp' }, device('server-b')]), StorageScope.PROFILE, StorageTarget.MACHINE);
		storage.remove('turbofile.transferProtocolDefault.autoFast.v1', StorageScope.PROFILE);
		await secrets.set('turbofile.device.secret.server-a.password', 'password-value');
		const configuredDevices = storage.get('turbofile.devices', StorageScope.PROFILE);
		const getSecret = sinon.spy(secrets, 'get');
		const setSecret = sinon.spy(secrets, 'set');
		const deleteSecret = sinon.spy(secrets, 'delete');

		store.reorderDevice('server-a', 'server-b', 'after');

		assert.deepStrictEqual({
			configurationUnchanged: storage.get('turbofile.devices', StorageScope.PROFILE) === configuredDevices,
			migration: storage.get('turbofile.transferProtocolDefault.autoFast.v1', StorageScope.PROFILE),
			credentialCalls: [getSecret.callCount, setSecret.callCount, deleteSecret.callCount]
		}, {
			configurationUnchanged: true,
			migration: undefined,
			credentialCalls: [0, 0, 0]
		});
	});

	test('appends a new device without changing the saved relative order', async () => {
		store.reorderDevice('server-b', 'local-windows', 'before');
		const created = await store.saveDevice({ name: 'new-server', host: '192.0.2.2', port: 22, username: 'test-user', authType: 'password', platform: 'linux' });
		const recreatedStore = disposables.add(new TurboFileDeviceStore(storage, secrets));

		assert.deepStrictEqual(allDeviceIds(recreatedStore), ['server-b', 'local-windows', 'server-a', created.id]);
	});

	test('filters unknown and duplicate IDs and ignores invalid or unchanged moves', () => {
		storage.store('turbofile.deviceOrder', JSON.stringify(['server-b', 'missing-device', 'server-b', null, 'local-windows', 'server-a']), StorageScope.PROFILE, StorageTarget.MACHINE);
		const initial = allDeviceIds();
		const invalidMoves = [
			store.reorderDevice('missing-device', 'server-a', 'before'),
			store.reorderDevice('server-a', 'missing-device', 'after'),
			store.reorderDevice('server-a', 'server-a', 'after'),
			store.reorderDevice('server-b', 'local-windows', 'before')
		];
		const changed = store.reorderDevice('server-a', 'local-windows', 'before');

		assert.deepStrictEqual({ initial, invalidMoves, changed, stored: JSON.parse(storage.get('turbofile.deviceOrder', StorageScope.PROFILE, '[]')) }, {
			initial: ['server-b', 'local-windows', 'server-a'],
			invalidMoves: [false, false, false, false],
			changed: true,
			stored: ['server-b', 'server-a', 'local-windows']
		});
	});

	test('falls back to the existing device sequence when the order is malformed', () => {
		const actual = ['invalid-json', '{}', 'null', '"server-b"'].map(value => {
			storage.store('turbofile.deviceOrder', value, StorageScope.PROFILE, StorageTarget.MACHINE);
			return allDeviceIds();
		});

		assert.deepStrictEqual(actual, Array.from({ length: 4 }, () => ['local-windows', 'server-a', 'server-b']));
	});

	test('removes deleted IDs from the saved sequence while preserving Windows', async () => {
		store.reorderDevice('server-b', 'local-windows', 'before');
		await store.deleteDevice('server-b');

		assert.deepStrictEqual({ visible: allDeviceIds(), stored: JSON.parse(storage.get('turbofile.deviceOrder', StorageScope.PROFILE, '[]')) }, {
			visible: ['local-windows', 'server-a'],
			stored: ['local-windows', 'server-a']
		});
	});

	test('broadcasts storage changes to other stores and skips equivalent order events', () => {
		const secondStore = disposables.add(new TurboFileDeviceStore(storage, secrets));
		let firstEvents = 0;
		let secondEvents = 0;
		disposables.add(store.onDidChangeDeviceOrder(() => firstEvents++));
		disposables.add(secondStore.onDidChangeDeviceOrder(() => secondEvents++));
		store.reorderDevice('server-b', 'local-windows', 'before');
		storage.store('turbofile.deviceOrder', JSON.stringify(['server-b', 'server-b', 'missing-device', 'local-windows', 'server-a']), StorageScope.PROFILE, StorageTarget.MACHINE);
		const synchronized = allDeviceIds(secondStore);
		secondStore.dispose();
		store.reorderDevice('local-windows', 'server-a', 'after');

		assert.deepStrictEqual({ synchronized, firstEvents, secondEvents }, {
			synchronized: ['server-b', 'local-windows', 'server-a'],
			firstEvents: 2,
			secondEvents: 1
		});
	});
});
