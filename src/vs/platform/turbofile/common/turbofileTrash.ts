/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../base/common/uuid.js';
import { localize } from '../../../nls.js';
import { ITurboFileFileOperationResult, ITurboFileTransferEndpoint, ITurboFileTrashDevice, ITurboFileTrashItem, ITurboFileTrashItemResult, ITurboFileTrashSource, TurboFileFileType } from './turbofile.js';

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

export interface ITurboFileTrashFallbackReplacement {
	readonly sourceIndex: number;
	readonly result: ITurboFileTrashItemResult;
}

export type TurboFileTrashFallbackExecutor = (
	entries: readonly ITurboFileTrashFallbackEntry[],
	task: (entry: ITurboFileTrashFallbackEntry) => Promise<ITurboFileTrashFallbackReplacement>
) => Promise<readonly ITurboFileTrashFallbackReplacement[]>;

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

export interface ITurboFileTrashChildPaths {
	readonly relativePath: string;
	readonly payloadPath: string;
	readonly originalPath: string;
}

/**
 * Resolves a child of a deleted directory without allowing the request to escape either the
 * recycle-bin payload or its original destination. The renderer performs the same check for early
 * feedback, but this platform-layer validation is the security boundary.
 */
export function resolveTurboFileTrashChildPaths(item: ITurboFileTrashItem, candidatePath: string, windowsPath: boolean): ITurboFileTrashChildPaths {
	const value = candidatePath.trim();
	if (!value || value.includes('\0') || /^[\\/]/.test(value) || /^[a-zA-Z]:/.test(value)) {
		throw new Error('Recycle-bin child path must be relative.');
	}
	const segments = value.split(/[\\/]+/);
	if (!segments.length || segments.some(segment => !segment || segment === '.' || segment === '..')) {
		throw new Error('Recycle-bin child path is invalid.');
	}
	const separator = windowsPath ? '\\' : '/';
	const relativePath = segments.join(separator);
	const joinChild = (root: string): string => `${root.replace(/[\\/]+$/, '')}${separator}${relativePath}`;
	return {
		relativePath,
		payloadPath: joinChild(item.payloadPath),
		originalPath: joinChild(item.originalPath)
	};
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

export async function runTurboFileTrashFallback(
	sources: readonly ITurboFileTrashSource[],
	trashResults: readonly ITurboFileTrashItemResult[],
	deletePath: (endpoint: ITurboFileTransferEndpoint) => Promise<ITurboFileFileOperationResult>,
	execute: TurboFileTrashFallbackExecutor
): Promise<{ readonly results: ITurboFileTrashItemResult[]; readonly usedFallback: boolean }> {
	const fallbackEntries = getTurboFileTrashFallbackEntries(sources, trashResults);
	if (!fallbackEntries.length) {
		return { results: [...trashResults], usedFallback: false };
	}
	const replacements = await execute(fallbackEntries, async entry => ({
		sourceIndex: entry.sourceIndex,
		result: createTurboFileTrashFallbackResult(entry.source, entry.trashResult, await deletePath(entry.source.endpoint))
	}));
	const results = [...trashResults];
	for (const replacement of replacements) {
		results[replacement.sourceIndex] = replacement.result;
	}
	return { results, usedFallback: true };
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
