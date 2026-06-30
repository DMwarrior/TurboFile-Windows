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

	test('removes legacy embedded default devices when no defaults are shipped', async () => {
		const legacyDefaultId = `${legacyDefaultPrefix}64`;
		const { store, storage, secrets } = createStore([
			device('manual-64', '192.168.9.64', 'ubuntu', 'manual-64'),
			device(legacyDefaultId, '192.168.9.64', 'ubuntu', 'default-64')
		]);

		await secrets.set('turbofile.device.secret.manual-64.password', 'old-manual-password');
		await secrets.set(`turbofile.device.secret.${legacyDefaultId}.password`, 'old-default-password');

		await store.ensureDefaultDevices();

		const devices = JSON.parse(storage.get('turbofile.devices', undefined, '[]')) as TurboFileDevice[];
		const ids = devices.map(device => device.id);
		assert.ok(ids.includes('manual-64'));
		assert.ok(!ids.includes(legacyDefaultId));
		assert.strictEqual(await secrets.get('turbofile.device.secret.manual-64.password'), 'old-manual-password');
		assert.strictEqual(await secrets.get(`turbofile.device.secret.${legacyDefaultId}.password`), undefined);
	});
});
