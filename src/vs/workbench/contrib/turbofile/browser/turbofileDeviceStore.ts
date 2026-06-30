/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../../base/common/uuid.js';
import { ISecretStorageService } from '../../../../platform/secrets/common/secrets.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { TurboFileAuthType, TurboFileDevice, TurboFileDeviceCapabilities, TurboFileDevicePlatform, TurboFileTransferProtocol, defaultTurboFileDeviceCapabilities, defaultTurboFileTransferProtocol } from '../common/turbofileTypes.js';

const TURBOFILE_DEVICES_STORAGE_KEY = 'turbofile.devices';
const TURBOFILE_DELETED_DEFAULT_DEVICES_STORAGE_KEY = 'turbofile.deletedDefaultDevices';
const TURBOFILE_SECRET_PREFIX = 'turbofile.device.secret';
const TURBOFILE_AUTO_FAST_DEFAULT_MIGRATION_KEY = 'turbofile.transferProtocolDefault.autoFast.v1';
const TURBOFILE_REQUIRED_DEFAULT_DEVICES_RESET_KEY = 'turbofile.requiredDefaultDevicesReset.v1';

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
	readonly preferredTransferProtocol?: TurboFileTransferProtocol;
}

interface TurboFileDefaultDevice extends TurboFileDeviceDraft {
	readonly id: string;
	readonly capabilities?: TurboFileDeviceCapabilities;
}

const TURBOFILE_DEFAULT_LINUX_CAPABILITIES: TurboFileDeviceCapabilities = {
	...defaultTurboFileDeviceCapabilities,
	rsync: false
};

function getDefaultCapabilitiesForPlatform(platform: TurboFileDevicePlatform | undefined): TurboFileDeviceCapabilities {
	return platform === 'linux' || platform === 'wsl'
		? TURBOFILE_DEFAULT_LINUX_CAPABILITIES
		: defaultTurboFileDeviceCapabilities;
}

function normalizeTransferProtocol(value: unknown): TurboFileTransferProtocol {
	return value === 'auto-fast' || value === 'rsync' || value === 'scp' || value === 'sftp' ? value : defaultTurboFileTransferProtocol;
}

function normalizeDefaultPath(path: string | undefined, platform: TurboFileDevicePlatform | undefined): string | undefined {
	const trimmed = path?.trim();
	if (!trimmed) {
		return undefined;
	}
	if (platform === 'windows') {
		return trimmed.replace(/\//g, '\\');
	}

	let normalized = trimmed.replace(/\\/g, '/');
	if (normalized === '.' || normalized === './' || normalized === '/.' || normalized === '/./') {
		return '/';
	}
	if (normalized.startsWith('./')) {
		normalized = normalized.substring(1);
	}
	if (!normalized.startsWith('/')) {
		normalized = `/${normalized}`;
	}
	normalized = normalized.replace(/\/+/g, '/').replace(/\/\.(?=\/|$)/g, '');
	if (normalized.length > 1) {
		normalized = normalized.replace(/\/+$/, '');
	}
	return normalized || '/';
}

const TURBOFILE_DEFAULT_SSH_DEVICES: readonly TurboFileDefaultDevice[] = [];

const TURBOFILE_LEGACY_DEFAULT_DEVICE_ID_PREFIX = 'turbofile-default-';

export class TurboFileDeviceStore {

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@ISecretStorageService private readonly secretStorageService: ISecretStorageService
	) { }

	loadDevices(): TurboFileDevice[] {
		const raw = this.storageService.get(TURBOFILE_DEVICES_STORAGE_KEY, StorageScope.PROFILE, '[]');
		try {
			const devices = JSON.parse(raw);
			if (!Array.isArray(devices)) {
				return [];
			}
			const normalized = devices.map(device => this.normalizeDevice(device)).filter((device): device is TurboFileDevice => !!device && device.platform !== 'windows');
			return this.migrateDefaultTransferProtocolToAutoFast(normalized);
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
			defaultPath: normalizeDefaultPath(draft.defaultPath, draft.platform),
			platform: draft.platform,
			privateKeyPath: draft.privateKeyPath?.trim() || undefined,
			capabilities: getDefaultCapabilitiesForPlatform(draft.platform),
			preferredTransferProtocol: normalizeTransferProtocol(draft.preferredTransferProtocol)
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

	async ensureDefaultDevices(): Promise<{ added: number; updated: number; removed: number }> {
		let devices = this.loadDevices();
		const deletedDefaultDeviceIds = this.loadDeletedDefaultDeviceIds();
		this.restoreRequiredDefaultDeviceDeleteMarkersOnce(deletedDefaultDeviceIds);
		let added = 0;
		let updated = 0;
		const removedDeviceIds = devices
			.filter(device => this.isLegacyDefaultDeviceId(device.id))
			.map(device => device.id);

		if (removedDeviceIds.length) {
			devices = devices.filter(device => !this.isLegacyDefaultDeviceId(device.id));
		}

		for (const deviceId of removedDeviceIds) {
			await this.secretStorageService.delete(this.getPasswordKey(deviceId));
			await this.secretStorageService.delete(this.getPrivateKeyKey(deviceId));
			await this.secretStorageService.delete(this.getPassphraseKey(deviceId));
		}

		for (const defaultDevice of TURBOFILE_DEFAULT_SSH_DEVICES) {
			if (deletedDefaultDeviceIds.has(defaultDevice.id)) {
				continue;
			}
			const existingIndex = this.findDefaultDeviceIndex(devices, defaultDevice);
			if (existingIndex >= 0) {
				const existingDevice = devices[existingIndex];
				const nextDevice = this.createDeviceFromDefault(defaultDevice, existingDevice);
				if (JSON.stringify(existingDevice) !== JSON.stringify(nextDevice)) {
					devices[existingIndex] = nextDevice;
					updated++;
				}
				await this.storeDefaultDeviceSecrets(defaultDevice, nextDevice.id, existingDevice.id);
				continue;
			}
			const device = this.createDeviceFromDefault(defaultDevice);

			devices.push(device);
			added++;
			await this.storeDefaultDeviceSecrets(defaultDevice, device.id);
		}

		if (added || updated || removedDeviceIds.length) {
			this.storeDevices(devices);
		}

		return { added, updated, removed: removedDeviceIds.length };
	}

	private restoreRequiredDefaultDeviceDeleteMarkersOnce(deletedDefaultDeviceIds: Set<string>): void {
		if (this.storageService.get(TURBOFILE_REQUIRED_DEFAULT_DEVICES_RESET_KEY, StorageScope.PROFILE, 'false') === 'true') {
			return;
		}

		let changed = false;
		for (const defaultDevice of TURBOFILE_DEFAULT_SSH_DEVICES) {
			changed = deletedDefaultDeviceIds.delete(defaultDevice.id) || changed;
		}
		if (changed) {
			this.storageService.store(TURBOFILE_DELETED_DEFAULT_DEVICES_STORAGE_KEY, JSON.stringify([...deletedDefaultDeviceIds]), StorageScope.PROFILE, StorageTarget.MACHINE);
		}
		this.storageService.store(TURBOFILE_REQUIRED_DEFAULT_DEVICES_RESET_KEY, 'true', StorageScope.PROFILE, StorageTarget.MACHINE);
	}

	private findDefaultDeviceIndex(devices: TurboFileDevice[], defaultDevice: TurboFileDefaultDevice): number {
		const idIndex = devices.findIndex(device => device.id === defaultDevice.id);
		if (idIndex >= 0) {
			return idIndex;
		}
		return devices.findIndex(device =>
			device.host === defaultDevice.host &&
			device.port === (defaultDevice.port || 22) &&
			device.username === defaultDevice.username
		);
	}

	private createDeviceFromDefault(defaultDevice: TurboFileDefaultDevice, existingDevice?: TurboFileDevice): TurboFileDevice {
		return {
			...existingDevice,
			id: defaultDevice.id,
			name: defaultDevice.name,
			host: defaultDevice.host,
			port: defaultDevice.port || 22,
			username: defaultDevice.username,
			authType: defaultDevice.authType,
			defaultPath: normalizeDefaultPath(defaultDevice.defaultPath, defaultDevice.platform),
			platform: defaultDevice.platform,
			privateKeyPath: defaultDevice.privateKeyPath,
			capabilities: defaultDevice.capabilities ?? getDefaultCapabilitiesForPlatform(defaultDevice.platform),
			preferredTransferProtocol: normalizeTransferProtocol(defaultDevice.preferredTransferProtocol)
		};
	}

	private async storeDefaultDeviceSecrets(defaultDevice: TurboFileDefaultDevice, deviceId: string, previousDeviceId?: string): Promise<void> {
		if (defaultDevice.password) {
			await this.secretStorageService.set(this.getPasswordKey(deviceId), defaultDevice.password);
		}
		if (defaultDevice.privateKey) {
			await this.secretStorageService.set(this.getPrivateKeyKey(deviceId), defaultDevice.privateKey);
		}
		if (defaultDevice.passphrase) {
			await this.secretStorageService.set(this.getPassphraseKey(deviceId), defaultDevice.passphrase);
		}
		if (previousDeviceId && previousDeviceId !== deviceId) {
			await this.secretStorageService.delete(this.getPasswordKey(previousDeviceId));
			await this.secretStorageService.delete(this.getPrivateKeyKey(previousDeviceId));
			await this.secretStorageService.delete(this.getPassphraseKey(previousDeviceId));
		}
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
			defaultPath: normalizeDefaultPath(draft.defaultPath, draft.platform),
			platform: draft.platform,
			privateKeyPath: draft.privateKeyPath?.trim() || undefined,
			preferredTransferProtocol: normalizeTransferProtocol(draft.preferredTransferProtocol)
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

	updateDeviceCapabilities(deviceId: string, capabilities: TurboFileDeviceCapabilities): TurboFileDevice | undefined {
		const devices = this.loadDevices();
		const index = devices.findIndex(device => device.id === deviceId);
		if (index < 0) {
			return undefined;
		}
		const device: TurboFileDevice = {
			...devices[index],
			capabilities
		};
		devices[index] = device;
		this.storeDevices(devices);
		return device;
	}

	private storeDevices(devices: TurboFileDevice[]): void {
		this.storageService.store(TURBOFILE_DEVICES_STORAGE_KEY, JSON.stringify(devices), StorageScope.PROFILE, StorageTarget.MACHINE);
	}

	private migrateDefaultTransferProtocolToAutoFast(devices: TurboFileDevice[]): TurboFileDevice[] {
		if (this.storageService.get(TURBOFILE_AUTO_FAST_DEFAULT_MIGRATION_KEY, StorageScope.PROFILE, 'false') === 'true') {
			return devices;
		}

		let changed = false;
		const migrated = devices.map(device => {
			if (device.preferredTransferProtocol !== 'scp') {
				return device;
			}
			changed = true;
			return {
				...device,
				preferredTransferProtocol: defaultTurboFileTransferProtocol
			};
		});

		if (changed) {
			this.storeDevices(migrated);
		}
		this.storageService.store(TURBOFILE_AUTO_FAST_DEFAULT_MIGRATION_KEY, 'true', StorageScope.PROFILE, StorageTarget.MACHINE);
		return migrated;
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
		return TURBOFILE_DEFAULT_SSH_DEVICES.some(device => device.id === deviceId) || this.isLegacyDefaultDeviceId(deviceId);
	}

	private isLegacyDefaultDeviceId(deviceId: string): boolean {
		return deviceId.startsWith(TURBOFILE_LEGACY_DEFAULT_DEVICE_ID_PREFIX) && !TURBOFILE_DEFAULT_SSH_DEVICES.some(device => device.id === deviceId);
	}

	private normalizeDevice(candidate: unknown): TurboFileDevice | undefined {
		const device = candidate as Partial<TurboFileDevice> | undefined;
		if (!device?.id || !device.host || !device.username) {
			return undefined;
		}

		const platform = device.platform ?? 'unknown';
		const defaultCapabilities = getDefaultCapabilitiesForPlatform(platform);

		return {
			id: String(device.id),
			name: String(device.name || device.host),
			host: String(device.host),
			port: Number(device.port) || 22,
			username: String(device.username),
			authType: device.authType === 'privateKey' ? 'privateKey' : 'password',
			defaultPath: normalizeDefaultPath(device.defaultPath, platform),
			platform,
			privateKeyPath: device.privateKeyPath,
			capabilities: {
				...defaultCapabilities,
				...device.capabilities,
				rsync: device.capabilities?.rsync ?? defaultCapabilities.rsync,
				tar: device.capabilities?.tar ?? device.capabilities?.archive ?? defaultCapabilities.tar
			},
			preferredTransferProtocol: normalizeTransferProtocol(device.preferredTransferProtocol),
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
