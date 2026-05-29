/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type TurboFileDevicePlatform = 'linux' | 'windows' | 'wsl' | 'unknown';
export type TurboFileAuthType = 'password' | 'privateKey';
export type TurboFileTransferProtocol = 'sftp' | 'scp' | 'rsync';

export interface TurboFileDevice {
	readonly id: string;
	readonly name: string;
	readonly host: string;
	readonly port: number;
	readonly username: string;
	readonly authType: TurboFileAuthType;
	readonly defaultPath?: string;
	readonly platform: TurboFileDevicePlatform;
	readonly privateKeyPath?: string;
	readonly capabilities: TurboFileDeviceCapabilities;
	readonly preferredTransferProtocol: TurboFileTransferProtocol;
	readonly lastConnectedAt?: number;
}

export interface TurboFileDeviceCapabilities {
	readonly ssh: boolean;
	readonly sftp: boolean;
	readonly scp: boolean;
	readonly rsync: boolean;
	readonly shell: boolean;
	readonly archive: boolean;
}

export const defaultTurboFileDeviceCapabilities: TurboFileDeviceCapabilities = {
	ssh: true,
	sftp: true,
	scp: true,
	rsync: false,
	shell: true,
	archive: true
};
