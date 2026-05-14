/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../../base/common/uuid.js';
import { ISecretStorageService } from '../../../../platform/secrets/common/secrets.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { TurboFileAuthType, TurboFileDevice, TurboFileDeviceCapabilities, TurboFileDevicePlatform, defaultTurboFileDeviceCapabilities } from '../common/turbofileTypes.js';

const TURBOFILE_DEVICES_STORAGE_KEY = 'turbofile.devices';
const TURBOFILE_DELETED_DEFAULT_DEVICES_STORAGE_KEY = 'turbofile.deletedDefaultDevices';
const TURBOFILE_SECRET_PREFIX = 'turbofile.device.secret';

export interface TurboFileDeviceDraft {
	readonly name: string;
	readonly host: string;
	readonly port: number;
	readonly username: string;
	readonly authType: TurboFileAuthType;
	readonly password?: string;
	readonly privateKey?: string;
	readonly privateKeyPath?: string;
	readonly passphrase?: string;
	readonly defaultPath?: string;
	readonly platform: TurboFileDevicePlatform;
}

interface TurboFileDefaultDevice extends TurboFileDeviceDraft {
	readonly id: string;
	readonly capabilities?: TurboFileDeviceCapabilities;
}

const TURBOFILE_DEFAULT_LINUX_CAPABILITIES: TurboFileDeviceCapabilities = {
	...defaultTurboFileDeviceCapabilities,
	rsync: true
};

const TURBOFILE_DEFAULT_SSH_DEVICES: readonly TurboFileDefaultDevice[] = [
	{
		id: 'turbofile-default-192-168-9-62',
		name: '62服务器',
		host: '192.168.9.62',
		port: 22,
		username: 'th',
		authType: 'password',
		password: 'th123456',
		defaultPath: '/home/th',
		platform: 'linux',
		capabilities: TURBOFILE_DEFAULT_LINUX_CAPABILITIES
	},
	{
		id: 'turbofile-default-192-168-9-61',
		name: '61服务器',
		host: '192.168.9.61',
		port: 22,
		username: 'th',
		authType: 'password',
		password: 'th123456',
		defaultPath: '/home/th',
		platform: 'linux',
		capabilities: TURBOFILE_DEFAULT_LINUX_CAPABILITIES
	},
	{
		id: 'turbofile-default-192-168-9-60',
		name: '60服务器',
		host: '192.168.9.60',
		port: 22,
		username: 'th',
		authType: 'password',
		password: 'taiho603656_0',
		defaultPath: '/home/th',
		platform: 'linux',
		capabilities: TURBOFILE_DEFAULT_LINUX_CAPABILITIES
	},
	{
		id: 'turbofile-default-192-168-9-57',
		name: '57服务器',
		host: '192.168.9.57',
		port: 22,
		username: 'thgd',
		authType: 'password',
		password: '123456',
		defaultPath: '/home/thgd',
		platform: 'linux',
		capabilities: TURBOFILE_DEFAULT_LINUX_CAPABILITIES
	},
	{
		id: 'turbofile-default-192-168-9-64',
		name: '64服务器',
		host: '192.168.9.64',
		port: 22,
		username: 'ubuntu',
		authType: 'password',
		password: 'asdf1234',
		defaultPath: '/home/ubuntu',
		platform: 'linux',
		capabilities: TURBOFILE_DEFAULT_LINUX_CAPABILITIES
	},
	{
		id: 'turbofile-default-221-226-81-42',
		name: 'ubuntu',
		host: '221.226.81.42',
		port: 5206,
		username: 'ubuntu',
		authType: 'password',
		password: 'asb#1234',
		defaultPath: '/home/ubuntu',
		platform: 'linux',
		capabilities: TURBOFILE_DEFAULT_LINUX_CAPABILITIES
	},
	{
		id: 'turbofile-default-36-33-34-59',
		name: 'hello',
		host: '36.33.34.59',
		port: 5206,
		username: 'hello',
		authType: 'password',
		password: 'Vps@1234',
		defaultPath: '/home/hello',
		platform: 'linux',
		capabilities: TURBOFILE_DEFAULT_LINUX_CAPABILITIES
	},
	{
		id: 'turbofile-default-8-147-112-203',
		name: 'A10服务器',
		host: '8.147.112.203',
		port: 22,
		username: 'root',
		authType: 'password',
		password: 'Th123456#',
		defaultPath: '/root',
		platform: 'linux',
		capabilities: TURBOFILE_DEFAULT_LINUX_CAPABILITIES
	}
];

export class TurboFileDeviceStore {

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ISecretStorageService private readonly secretStorageService: ISecretStorageService
	) { }

	loadDevices(): TurboFileDevice[] {
		const raw = this.storageService.get(TURBOFILE_DEVICES_STORAGE_KEY, StorageScope.PROFILE, '[]');
		try {
			const devices = JSON.parse(raw);
			return Array.isArray(devices) ? devices.map(device => this.normalizeDevice(device)).filter((device): device is TurboFileDevice => !!device && device.platform !== 'windows') : [];
		} catch {
			return [];
		}
	}

	async saveDevice(draft: TurboFileDeviceDraft): Promise<TurboFileDevice> {
		const device: TurboFileDevice = {
			id: generateUuid(),
			name: draft.name.trim() || draft.host.trim(),
			host: draft.host.trim(),
			port: draft.port || 22,
			username: draft.username.trim(),
			authType: draft.authType,
			defaultPath: draft.defaultPath?.trim() || undefined,
			platform: draft.platform,
			privateKeyPath: draft.privateKeyPath?.trim() || undefined,
			capabilities: defaultTurboFileDeviceCapabilities
		};

		const devices = [...this.loadDevices(), device];
		this.storeDevices(devices);

		if (draft.password) {
			await this.secretStorageService.set(this.getPasswordKey(device.id), draft.password);
		}
		if (draft.privateKey) {
			await this.secretStorageService.set(this.getPrivateKeyKey(device.id), draft.privateKey);
		}
		if (draft.passphrase) {
			await this.secretStorageService.set(this.getPassphraseKey(device.id), draft.passphrase);
		}

		return device;
	}

	async ensureDefaultDevices(): Promise<{ added: number; updated: number }> {
		const devices = this.loadDevices();
		const deletedDefaultDeviceIds = this.loadDeletedDefaultDeviceIds();
		let added = 0;
		let updated = 0;

		for (const defaultDevice of TURBOFILE_DEFAULT_SSH_DEVICES) {
			if (deletedDefaultDeviceIds.has(defaultDevice.id)) {
				continue;
			}
			const existingIndex = devices.findIndex(device =>
				device.id === defaultDevice.id ||
				(device.host === defaultDevice.host && device.port === defaultDevice.port && device.username === defaultDevice.username)
			);
			if (existingIndex >= 0) {
				continue;
			}
			const device: TurboFileDevice = {
				id: defaultDevice.id,
				name: defaultDevice.name,
				host: defaultDevice.host,
				port: defaultDevice.port || 22,
				username: defaultDevice.username,
				authType: defaultDevice.authType,
				defaultPath: defaultDevice.defaultPath,
				platform: defaultDevice.platform,
				privateKeyPath: defaultDevice.privateKeyPath,
				capabilities: defaultDevice.capabilities ?? defaultTurboFileDeviceCapabilities
			};

			devices.push(device);
			added++;

			if (defaultDevice.password) {
				await this.secretStorageService.set(this.getPasswordKey(device.id), defaultDevice.password);
			}
			if (defaultDevice.privateKey) {
				await this.secretStorageService.set(this.getPrivateKeyKey(device.id), defaultDevice.privateKey);
			}
			if (defaultDevice.passphrase) {
				await this.secretStorageService.set(this.getPassphraseKey(device.id), defaultDevice.passphrase);
			}
		}

		if (added || updated) {
			this.storeDevices(devices);
		}

		return { added, updated };
	}

	async updateDevice(deviceId: string, draft: TurboFileDeviceDraft): Promise<TurboFileDevice> {
		const devices = this.loadDevices();
		const index = devices.findIndex(device => device.id === deviceId);
		if (index < 0) {
			throw new Error('Device not found');
		}

		const existing = devices[index];
		const device: TurboFileDevice = {
			...existing,
			name: draft.name.trim() || draft.host.trim(),
			host: draft.host.trim(),
			port: draft.port || 22,
			username: draft.username.trim(),
			authType: draft.authType,
			defaultPath: draft.defaultPath?.trim() || undefined,
			platform: draft.platform,
			privateKeyPath: draft.privateKeyPath?.trim() || undefined
		};
		devices[index] = device;
		this.storeDevices(devices);

		if (draft.password) {
			await this.secretStorageService.set(this.getPasswordKey(device.id), draft.password);
		}
		if (draft.privateKey) {
			await this.secretStorageService.set(this.getPrivateKeyKey(device.id), draft.privateKey);
		}
		if (draft.passphrase) {
			await this.secretStorageService.set(this.getPassphraseKey(device.id), draft.passphrase);
		}

		return device;
	}

	async deleteDevice(deviceId: string): Promise<void> {
		const devices = this.loadDevices();
		const nextDevices = devices.filter(device => device.id !== deviceId);
		this.storeDevices(nextDevices);
		if (this.isDefaultDeviceId(deviceId)) {
			const deletedDefaultDeviceIds = this.loadDeletedDefaultDeviceIds();
			deletedDefaultDeviceIds.add(deviceId);
			this.storageService.store(TURBOFILE_DELETED_DEFAULT_DEVICES_STORAGE_KEY, JSON.stringify([...deletedDefaultDeviceIds]), StorageScope.PROFILE, StorageTarget.MACHINE);
		}
		await this.secretStorageService.delete(this.getPasswordKey(deviceId));
		await this.secretStorageService.delete(this.getPrivateKeyKey(deviceId));
		await this.secretStorageService.delete(this.getPassphraseKey(deviceId));
	}

	async getPassword(deviceId: string): Promise<string | undefined> {
		return this.secretStorageService.get(this.getPasswordKey(deviceId));
	}

	async getPrivateKey(deviceId: string): Promise<string | undefined> {
		return this.secretStorageService.get(this.getPrivateKeyKey(deviceId));
	}

	async getPassphrase(deviceId: string): Promise<string | undefined> {
		return this.secretStorageService.get(this.getPassphraseKey(deviceId));
	}

	private storeDevices(devices: TurboFileDevice[]): void {
		this.storageService.store(TURBOFILE_DEVICES_STORAGE_KEY, JSON.stringify(devices), StorageScope.PROFILE, StorageTarget.MACHINE);
	}

	private loadDeletedDefaultDeviceIds(): Set<string> {
		const raw = this.storageService.get(TURBOFILE_DELETED_DEFAULT_DEVICES_STORAGE_KEY, StorageScope.PROFILE, '[]');
		try {
			const parsed = JSON.parse(raw);
			return new Set(Array.isArray(parsed) ? parsed.filter(value => typeof value === 'string') : []);
		} catch {
			return new Set();
		}
	}

	private isDefaultDeviceId(deviceId: string): boolean {
		return TURBOFILE_DEFAULT_SSH_DEVICES.some(device => device.id === deviceId);
	}

	private normalizeDevice(candidate: unknown): TurboFileDevice | undefined {
		const device = candidate as Partial<TurboFileDevice> | undefined;
		if (!device?.id || !device.host || !device.username) {
			return undefined;
		}

		return {
			id: String(device.id),
			name: String(device.name || device.host),
			host: String(device.host),
			port: Number(device.port) || 22,
			username: String(device.username),
			authType: device.authType === 'privateKey' ? 'privateKey' : 'password',
			defaultPath: device.defaultPath,
			platform: device.platform ?? 'unknown',
			privateKeyPath: device.privateKeyPath,
			capabilities: device.capabilities ?? defaultTurboFileDeviceCapabilities,
			lastConnectedAt: device.lastConnectedAt
		};
	}


	private getPasswordKey(deviceId: string): string {
		return `${TURBOFILE_SECRET_PREFIX}.${deviceId}.password`;
	}

	private getPrivateKeyKey(deviceId: string): string {
		return `${TURBOFILE_SECRET_PREFIX}.${deviceId}.privateKey`;
	}

	private getPassphraseKey(deviceId: string): string {
		return `${TURBOFILE_SECRET_PREFIX}.${deviceId}.passphrase`;
	}
}
