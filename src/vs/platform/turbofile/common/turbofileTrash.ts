/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../base/common/uuid.js';
import { ITurboFileTrashDevice, ITurboFileTrashItem, TurboFileFileType } from './turbofile.js';

interface ITurboFileTrashMetadataCandidate {
	readonly id?: unknown;
	readonly originalName?: unknown;
	readonly originalPath?: unknown;
	readonly deletedAt?: unknown;
	readonly type?: unknown;
	readonly knownSize?: unknown;
	readonly volumeId?: unknown;
	readonly trashRoot?: unknown;
	readonly payloadPath?: unknown;
	readonly deviceIdentity?: unknown;
}

const turboFileFileTypes = new Set<TurboFileFileType>(['file', 'directory', 'symlink', 'unknown']);

export function getTurboFileTrashDeviceIdentity(device: ITurboFileTrashDevice): string {
	if (device.kind === 'local') {
		return `local:${(device.localUserIdentity ?? 'current-user').trim().toLowerCase()}`;
	}
	const connection = device.connection;
	if (!connection) {
		throw new Error('SSH recycle-bin operations require a connection.');
	}
	return `ssh:${connection.host.trim().toLowerCase()}:${connection.port}:${connection.username.trim().toLowerCase()}`;
}

export function createTurboFileTrashItemId(): string {
	return generateUuid();
}

export function createTurboFileKeepBothName(name: string, ordinal: number): string {
	const extensionIndex = name.lastIndexOf('.');
	if (extensionIndex <= 0) {
		return `${name} (${ordinal})`;
	}
	return `${name.slice(0, extensionIndex)} (${ordinal})${name.slice(extensionIndex)}`;
}

export function sortTurboFileTrashItems(items: readonly ITurboFileTrashItem[]): ITurboFileTrashItem[] {
	return [...items].sort((left, right) => right.deletedAt - left.deletedAt || left.originalName.localeCompare(right.originalName));
}

export function isTurboFileProtectedTrashSource(path: string, windowsPath: boolean): boolean {
	const trimmed = path.trim();
	if (!trimmed) {
		return true;
	}
	if (windowsPath) {
		const normalized = trimmed.replace(/\//g, '\\').replace(/\\+$/, '');
		if (/^[A-Za-z]:$/.test(normalized) || normalized === '') {
			return true;
		}
		return /(?:^|\\)(?:\.turbofile-trash-[^\\]+|RecycleBin)(?:\\|$)/i.test(normalized);
	}
	const normalized = trimmed.replace(/\/+$/, '') || '/';
	if (normalized === '/') {
		return true;
	}
	return /(?:^|\/)(?:\.Trash(?:-[^/]+)?|Trash)\/(?:turbofile)(?:\/|$)/.test(normalized);
}

export function isTurboFileTrashMetadata(value: unknown): value is ITurboFileTrashItem {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const candidate = value as ITurboFileTrashMetadataCandidate;
	return typeof candidate.id === 'string'
		&& typeof candidate.originalName === 'string'
		&& typeof candidate.originalPath === 'string'
		&& typeof candidate.deletedAt === 'number'
		&& turboFileFileTypes.has(candidate.type as TurboFileFileType)
		&& (candidate.knownSize === undefined || typeof candidate.knownSize === 'number')
		&& typeof candidate.volumeId === 'string'
		&& typeof candidate.trashRoot === 'string'
		&& typeof candidate.payloadPath === 'string'
		&& typeof candidate.deviceIdentity === 'string';
}
