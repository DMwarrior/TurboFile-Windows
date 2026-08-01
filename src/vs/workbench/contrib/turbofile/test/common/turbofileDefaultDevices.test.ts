/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { TurboFileDeviceDraft, TurboFileDeviceStore } from '../../browser/turbofileDeviceStore.js';
import { defaultTurboFileDeviceCapabilities, TurboFileDevice } from '../../common/turbofileTypes.js';

class TestStorageService {
	readonly values = new Map<string, string>();

	get(key: string, _scope: unknown, fallbackValue: string): string {
		return this.values.get(key) ?? fallbackValue;
	}

	store(key: string, value: string): void {
		this.values.set(key, value);
	}
}

class TestSecretStorageService {
	private readonly onDidChangeSecretEmitter = new Emitter<string>();
	readonly onDidChangeSecret = this.onDidChangeSecretEmitter.event;
	readonly values = new Map<string, string>();
	readonly getCallCounts = new Map<string, number>();
	readonly getFailuresRemaining = new Map<string, number>();
	readonly setBlockers = new Map<string, Promise<void>>();

	get(key: string): Promise<string | undefined> {
		this.getCallCounts.set(key, (this.getCallCounts.get(key) ?? 0) + 1);
		const failuresRemaining = this.getFailuresRemaining.get(key) ?? 0;
		if (failuresRemaining > 0) {
			this.getFailuresRemaining.set(key, failuresRemaining - 1);
			return Promise.reject(new Error('Secret read failed'));
		}
		return Promise.resolve(this.values.get(key));
	}

	async set(key: string, value: string): Promise<void> {
		await this.setBlockers.get(key);
		this.values.set(key, value);
		this.onDidChangeSecretEmitter.fire(key);
	}

	delete(key: string): Promise<void> {
		this.values.delete(key);
		this.onDidChangeSecretEmitter.fire(key);
		return Promise.resolve();
	}
}

function createStore(devices: TurboFileDevice[], deletedDefaultDeviceIds: string[] = []): { store: TurboFileDeviceStore; storage: TestStorageService; secrets: TestSecretStorageService } {
	const storage = new TestStorageService();
	const secrets = new TestSecretStorageService();
	storage.store('turbofile.devices', JSON.stringify(devices));
	storage.store('turbofile.deletedDefaultDevices', JSON.stringify(deletedDefaultDeviceIds));
	return {
		store: new TurboFileDeviceStore(storage as any, secrets as any),
		storage,
		secrets
	};
}

function device(id: string, host: string, username: string, name = host, port = 22): TurboFileDevice {
	return {
		id,
		name,
		host,
		port,
		username,
		authType: 'password',
		defaultPath: '/',
		platform: 'linux',
		capabilities: defaultTurboFileDeviceCapabilities,
		preferredTransferProtocol: 'auto-fast'
	};
}

function draft(overrides: Partial<TurboFileDeviceDraft> = {}): TurboFileDeviceDraft {
	return {
		name: 'test-device',
		host: '192.0.2.1',
		port: 22,
		username: 'test-user',
		authType: 'password',
		platform: 'linux',
		...overrides
	};
}

suite('TurboFileDefaultDevices', () => {
	const legacyDefaultPrefix = 'turbofile-' + 'default-';

	test('public build does not embed default SSH devices or passwords', () => {
		const source = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileDeviceStore.ts'), 'utf8');

		const defaultIds = Array.from(source.matchAll(/id: '(turbofile-default-[^']+)'/g), match => match[1]);
		assert.deepStrictEqual(defaultIds, []);

		for (const forbidden of [
			"password: '",
			...['62', '61', '60', '57', '64', 'nas', '5336'].map(id => `${legacyDefaultPrefix}${id}`)
		]) {
			assert.ok(!source.includes(forbidden), `Embedded default device marker should not be present: ${forbidden}`);
		}
	});

	test('preserves legacy embedded default devices when no defaults are shipped', async () => {
		const legacyDefaultId = `${legacyDefaultPrefix}64`;
		const { store, storage, secrets } = createStore([
			device('manual-64', '192.168.9.64', 'ubuntu', 'manual-64'),
			device(legacyDefaultId, '192.168.9.64', 'ubuntu', 'default-64')
		]);

		await secrets.set('turbofile.device.secret.manual-64.password', 'old-manual-password');
		await secrets.set(`turbofile.device.secret.${legacyDefaultId}.password`, 'old-default-password');

		const result = await store.ensureDefaultDevices();

		const devices = JSON.parse(storage.get('turbofile.devices', undefined, '[]')) as TurboFileDevice[];
		const ids = devices.map(device => device.id);
		assert.ok(ids.includes('manual-64'));
		assert.ok(ids.includes(legacyDefaultId));
		assert.strictEqual(await secrets.get('turbofile.device.secret.manual-64.password'), 'old-manual-password');
		assert.strictEqual(await secrets.get(`turbofile.device.secret.${legacyDefaultId}.password`), 'old-default-password');
		assert.deepStrictEqual(result, { added: 0, updated: 0, removed: 0 });
	});

	test('coalesces concurrent secret reads and caches resolved values', async () => {
		const { store, secrets } = createStore([device('cached-device', '192.0.2.1', 'test-user')]);
		const passwordKey = 'turbofile.device.secret.cached-device.password';
		const privateKeyKey = 'turbofile.device.secret.cached-device.privateKey';
		const passphraseKey = 'turbofile.device.secret.cached-device.passphrase';
		secrets.values.set(passwordKey, 'password-value');
		secrets.values.set(privateKeyKey, 'private-key-value');
		secrets.values.set(passphraseKey, 'passphrase-value');

		const firstPasswordRead = store.getPassword('cached-device');
		const concurrentPasswordRead = store.getPassword('cached-device');
		assert.strictEqual(concurrentPasswordRead, firstPasswordRead);

		const values = await Promise.all([
			firstPasswordRead,
			concurrentPasswordRead,
			store.getPrivateKey('cached-device'),
			store.getPrivateKey('cached-device'),
			store.getPassphrase('cached-device'),
			store.getPassphrase('cached-device')
		]);
		await Promise.all([
			store.getPassword('cached-device'),
			store.getPrivateKey('cached-device'),
			store.getPassphrase('cached-device')
		]);

		assert.deepStrictEqual({
			values,
			getCallCounts: [passwordKey, privateKeyKey, passphraseKey].map(key => secrets.getCallCounts.get(key))
		}, {
			values: ['password-value', 'password-value', 'private-key-value', 'private-key-value', 'passphrase-value', 'passphrase-value'],
			getCallCounts: [1, 1, 1]
		});
	});

	test('evicts a rejected secret read so the next read retries storage', async () => {
		const { store, secrets } = createStore([device('retry-device', '192.0.2.1', 'test-user')]);
		const passwordKey = 'turbofile.device.secret.retry-device.password';
		secrets.values.set(passwordKey, 'password-value');
		secrets.getFailuresRemaining.set(passwordKey, 1);

		await assert.rejects(store.getPassword('retry-device'), /Secret read failed/);
		const value = await store.getPassword('retry-device');

		assert.deepStrictEqual({ value, getCallCount: secrets.getCallCounts.get(passwordKey) }, {
			value: 'password-value',
			getCallCount: 2
		});
	});

	test('save and update keep the secret cache synchronized with storage', async () => {
		const { store, secrets } = createStore([]);
		const created = await store.saveDevice(draft({
			password: 'saved-password',
			privateKey: 'saved-private-key',
			passphrase: 'saved-passphrase'
		}));
		const passwordKey = `turbofile.device.secret.${created.id}.password`;
		const privateKeyKey = `turbofile.device.secret.${created.id}.privateKey`;
		const passphraseKey = `turbofile.device.secret.${created.id}.passphrase`;

		const savedValues = await Promise.all([
			store.getPassword(created.id),
			store.getPrivateKey(created.id),
			store.getPassphrase(created.id)
		]);
		await store.updateDevice(created.id, draft({
			password: 'updated-password',
			privateKey: 'updated-private-key',
			passphrase: 'updated-passphrase'
		}));
		const updatedValues = await Promise.all([
			store.getPassword(created.id),
			store.getPrivateKey(created.id),
			store.getPassphrase(created.id)
		]);
		await store.updateDevice(created.id, draft({ password: '', passphrase: '' }));
		const valuesAfterEmptyUpdate = await Promise.all([
			store.getPassword(created.id),
			store.getPrivateKey(created.id),
			store.getPassphrase(created.id)
		]);

		assert.deepStrictEqual({
			savedValues,
			updatedValues,
			valuesAfterEmptyUpdate,
			storedValues: [passwordKey, privateKeyKey, passphraseKey].map(key => secrets.values.get(key)),
			getCallCounts: [passwordKey, privateKeyKey, passphraseKey].map(key => secrets.getCallCounts.get(key) ?? 0)
		}, {
			savedValues: ['saved-password', 'saved-private-key', 'saved-passphrase'],
			updatedValues: ['updated-password', 'updated-private-key', 'updated-passphrase'],
			valuesAfterEmptyUpdate: ['updated-password', 'updated-private-key', 'updated-passphrase'],
			storedValues: ['updated-password', 'updated-private-key', 'updated-passphrase'],
			getCallCounts: [2, 2, 2]
		});
	});

	test('invalidates cached credentials when another store updates them', async () => {
		const storage = new TestStorageService();
		const secrets = new TestSecretStorageService();
		storage.store('turbofile.devices', JSON.stringify([device('shared-device', '192.0.2.1', 'test-user')]));
		const firstStore = new TurboFileDeviceStore(storage as any, secrets as any);
		const secondStore = new TurboFileDeviceStore(storage as any, secrets as any);
		const passwordKey = 'turbofile.device.secret.shared-device.password';
		const privateKeyKey = 'turbofile.device.secret.shared-device.privateKey';
		secrets.values.set(passwordKey, 'old-password');
		secrets.values.set(privateKeyKey, 'old-private-key');

		assert.deepStrictEqual(await Promise.all([
			firstStore.getPassword('shared-device'),
			firstStore.getPrivateKey('shared-device')
		]), ['old-password', 'old-private-key']);

		await secondStore.updateDevice('shared-device', draft({
			password: 'new-password',
			privateKey: 'new-private-key'
		}));

		assert.deepStrictEqual({
			values: await Promise.all([
				firstStore.getPassword('shared-device'),
				firstStore.getPrivateKey('shared-device')
			]),
			getCallCounts: [secrets.getCallCounts.get(passwordKey), secrets.getCallCounts.get(privateKeyKey)]
		}, {
			values: ['new-password', 'new-private-key'],
			getCallCounts: [2, 2]
		});

		firstStore.dispose();
		secondStore.dispose();
	});

	test('invalidates cached credentials when another store deletes them', async () => {
		const storage = new TestStorageService();
		const secrets = new TestSecretStorageService();
		storage.store('turbofile.devices', JSON.stringify([device('shared-delete-device', '192.0.2.1', 'test-user')]));
		const firstStore = new TurboFileDeviceStore(storage as any, secrets as any);
		const secondStore = new TurboFileDeviceStore(storage as any, secrets as any);
		const passwordKey = 'turbofile.device.secret.shared-delete-device.password';
		secrets.values.set(passwordKey, 'old-password');

		assert.strictEqual(await firstStore.getPassword('shared-delete-device'), 'old-password');
		await secondStore.deleteDevice('shared-delete-device');

		assert.deepStrictEqual({
			value: await firstStore.getPassword('shared-delete-device'),
			getCallCount: secrets.getCallCounts.get(passwordKey)
		}, {
			value: undefined,
			getCallCount: 2
		});

		firstStore.dispose();
		secondStore.dispose();
	});

	test('serializes delete after an in-flight secret update', async () => {
		const { store, secrets } = createStore([device('racing-device', '192.0.2.1', 'test-user')]);
		const passwordKey = 'turbofile.device.secret.racing-device.password';
		const privateKeyKey = 'turbofile.device.secret.racing-device.privateKey';
		const passphraseKey = 'turbofile.device.secret.racing-device.passphrase';
		for (const [key, value] of [
			[passwordKey, 'original-password'],
			[privateKeyKey, 'original-private-key'],
			[passphraseKey, 'original-passphrase']
		] as const) {
			secrets.values.set(key, value);
		}
		const setBarrier = new DeferredPromise<void>();
		secrets.setBlockers.set(passwordKey, setBarrier.p);

		const updatePromise = store.updateDevice('racing-device', draft({
			password: 'updated-password',
			privateKey: 'updated-private-key',
			passphrase: 'updated-passphrase'
		}));
		const deletePromise = store.deleteDevice('racing-device');
		setBarrier.complete();
		await Promise.all([updatePromise, deletePromise]);
		const keys = [passwordKey, privateKeyKey, passphraseKey];

		assert.deepStrictEqual({
			storedValues: keys.map(key => secrets.values.get(key)),
			cachedValues: await Promise.all([
				store.getPassword('racing-device'),
				store.getPrivateKey('racing-device'),
				store.getPassphrase('racing-device')
			])
		}, {
			storedValues: [undefined, undefined, undefined],
			cachedValues: [undefined, undefined, undefined]
		});
	});

	test('delete invalidates cached secret values', async () => {
		const { store, secrets } = createStore([device('deleted-device', '192.0.2.1', 'test-user')]);
		const passwordKey = 'turbofile.device.secret.deleted-device.password';
		const privateKeyKey = 'turbofile.device.secret.deleted-device.privateKey';
		const passphraseKey = 'turbofile.device.secret.deleted-device.passphrase';
		for (const [key, value] of [
			[passwordKey, 'password-value'],
			[privateKeyKey, 'private-key-value'],
			[passphraseKey, 'passphrase-value']
		] as const) {
			secrets.values.set(key, value);
		}
		await Promise.all([
			store.getPassword('deleted-device'),
			store.getPrivateKey('deleted-device'),
			store.getPassphrase('deleted-device')
		]);

		await store.deleteDevice('deleted-device');
		const valuesAfterDelete = await Promise.all([
			store.getPassword('deleted-device'),
			store.getPrivateKey('deleted-device'),
			store.getPassphrase('deleted-device')
		]);

		assert.deepStrictEqual({
			valuesAfterDelete,
			storedValues: [passwordKey, privateKeyKey, passphraseKey].map(key => secrets.values.get(key)),
			getCallCounts: [passwordKey, privateKeyKey, passphraseKey].map(key => secrets.getCallCounts.get(key))
		}, {
			valuesAfterDelete: [undefined, undefined, undefined],
			storedValues: [undefined, undefined, undefined],
			getCallCounts: [2, 2, 2]
		});
	});
});
