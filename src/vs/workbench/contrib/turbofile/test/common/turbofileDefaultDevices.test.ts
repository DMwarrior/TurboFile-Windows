/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { TurboFileDeviceStore } from '../../browser/turbofileDeviceStore.js';
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
	readonly values = new Map<string, string>();

	get(key: string): Promise<string | undefined> {
		return Promise.resolve(this.values.get(key));
	}

	set(key: string, value: string): Promise<void> {
		this.values.set(key, value);
		return Promise.resolve();
	}

	delete(key: string): Promise<void> {
		this.values.delete(key);
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

suite('TurboFileDefaultDevices', () => {
	test('local private build embeds only requested default SSH devices', () => {
		const source = fs.readFileSync(path.join(process.cwd(), 'src/vs/workbench/contrib/turbofile/browser/turbofileDeviceStore.ts'), 'utf8');

		const defaultIds = Array.from(source.matchAll(/id: '(turbofile-default-[^']+)'/g), match => match[1]);
		assert.deepStrictEqual(defaultIds, [
			'turbofile-default-61',
			'turbofile-default-57',
			'turbofile-default-60',
			'turbofile-default-64',
			'turbofile-default-62',
			'turbofile-default-nas',
			'turbofile-default-5336'
		]);

		for (const expected of [
			"id: 'turbofile-default-62'",
			"id: 'turbofile-default-61'",
			"id: 'turbofile-default-60'",
			"id: 'turbofile-default-57'",
			"id: 'turbofile-default-64'",
			"id: 'turbofile-default-nas'",
			"id: 'turbofile-default-5336'",
			"password: 'th123456'",
			"password: '123456'",
			"password: 'taiho603656_0'",
			"password: 'asdf1234'",
			"password: 'Ai123456'",
			"password: 'depstek'"
		]) {
			assert.ok(source.includes(expected), `Missing default secret marker: ${expected}`);
		}
	});

	test('migrates matching manual devices into required default devices', async () => {
		const { store, storage, secrets } = createStore([
			device('manual-64', '192.168.9.64', 'ubuntu', '64服务器'),
			device('manual-nas', '10.190.21.253', 'Algorithm', 'NAS', 8000)
		], ['turbofile-default-nas']);

		await secrets.set('turbofile.device.secret.manual-64.password', 'old-manual-password');
		await secrets.set('turbofile.device.secret.manual-nas.password', 'old-manual-password');

		await store.ensureDefaultDevices();

		const devices = JSON.parse(storage.get('turbofile.devices', undefined, '[]')) as TurboFileDevice[];
		const ids = devices.map(device => device.id);
		assert.ok(ids.includes('turbofile-default-64'));
		assert.ok(ids.includes('turbofile-default-nas'));
		assert.ok(!ids.includes('manual-64'));
		assert.ok(!ids.includes('manual-nas'));
		assert.ok(!JSON.parse(storage.get('turbofile.deletedDefaultDevices', undefined, '[]')).includes('turbofile-default-nas'));
		assert.strictEqual(await secrets.get('turbofile.device.secret.manual-64.password'), undefined);
		assert.strictEqual(await secrets.get('turbofile.device.secret.manual-nas.password'), undefined);
		assert.strictEqual(await secrets.get('turbofile.device.secret.turbofile-default-64.password'), 'asdf1234');
		assert.strictEqual(await secrets.get('turbofile.device.secret.turbofile-default-nas.password'), 'Ai123456');
	});
});
