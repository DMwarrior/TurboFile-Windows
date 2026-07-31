/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../base/common/uuid.js';
import { localize } from '../../../nls.js';
import { ITurboFileFileOperationResult, ITurboFileTrashDevice, ITurboFileTrashItem, ITurboFileTrashItemResult, ITurboFileTrashSource, TurboFileFileType } from './turbofile.js';

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

export interface ITurboFileTrashFallbackEntry {
	readonly source: ITurboFileTrashSource;
	readonly sourceIndex: number;
	readonly trashResult: ITurboFileTrashItemResult | undefined;
}

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

export function getTurboFileTrashFallbackSources(sources: readonly ITurboFileTrashSource[], results: readonly ITurboFileTrashItemResult[]): ITurboFileTrashSource[] {
	return getTurboFileTrashFallbackEntries(sources, results).map(entry => entry.source);
}

export function getTurboFileTrashFallbackEntries(sources: readonly ITurboFileTrashSource[], results: readonly ITurboFileTrashItemResult[]): ITurboFileTrashFallbackEntry[] {
	const entries: ITurboFileTrashFallbackEntry[] = [];
	for (const [sourceIndex, source] of sources.entries()) {
		const trashResult = results[sourceIndex];
		if (trashResult?.ok !== true) {
			entries.push({ source, sourceIndex, trashResult });
		}
	}
	return entries;
}

export function createTurboFileTrashFallbackResult(source: ITurboFileTrashSource, trashResult: ITurboFileTrashItemResult | undefined, deleteResult: ITurboFileFileOperationResult): ITurboFileTrashItemResult {
	if (deleteResult.ok) {
		return {
			path: source.endpoint.path,
			ok: true,
			message: localize('turbofileTrashFallbackDeleteSucceeded', 'The item could not be moved to the recycle bin and was permanently deleted instead.')
		};
	}
	const trashMessage = trashResult?.message ?? localize('turbofileTrashFallbackMissingResult', 'Recycle-bin move returned no result.');
	return {
		path: source.endpoint.path,
		ok: false,
		message: localize('turbofileTrashFallbackDeleteFailed', '{0} Permanent delete fallback failed: {1}', trashMessage, deleteResult.message)
	};
}

export function combineTurboFileTrashOperationResults(validationResults: readonly ITurboFileTrashItemResult[], trashResults: readonly ITurboFileTrashItemResult[]): ITurboFileTrashItemResult[] {
	return [...validationResults, ...trashResults];
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
