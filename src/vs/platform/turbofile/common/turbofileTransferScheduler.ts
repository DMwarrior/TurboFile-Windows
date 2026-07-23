/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ITurboFileTransferEndpoint } from './turbofile.js';
import type { ITurboFileTransferFailure } from './turbofileTransferFailure.js';

export interface ITurboFileBatchConcurrencyLimits {
	readonly files: number;
	readonly directories: number;
}

interface IDeviceConcurrencyState {
	files: number;
	directories: number;
	successes: number;
	ceiling: ITurboFileBatchConcurrencyLimits;
}

const STANDARD_LIMITS: ITurboFileBatchConcurrencyLimits = { files: 16, directories: 4 };
const SHARED_STORAGE_LIMITS: ITurboFileBatchConcurrencyLimits = { files: 8, directories: 2 };
const MAX_BATCH_PATH_CLAIMS = 256;

export class TurboFileTransferScheduler {
	private readonly states = new Map<string, IDeviceConcurrencyState>();

	getBatchLimits(endpoint: ITurboFileTransferEndpoint): ITurboFileBatchConcurrencyLimits {
		const state = this.getState(endpoint);
		return { files: state.files, directories: state.directories };
	}

	getDeviceCapacity(endpoint: ITurboFileTransferEndpoint, sourceType: 'file' | 'directory' = 'file'): number {
		const state = this.getState(endpoint);
		return Math.max(1, sourceType === 'directory' ? state.directories : state.files);
	}

	recordResult(endpoint: ITurboFileTransferEndpoint, result: ITurboFileTransferFailure): void {
		if (!result.reduceConcurrency) {
			return;
		}
		const state = this.getState(endpoint);
		state.files = Math.max(2, Math.floor(state.files / 2));
		state.directories = Math.max(1, Math.floor(state.directories / 2));
		state.successes = 0;
	}

	recordSuccess(endpoint: ITurboFileTransferEndpoint): void {
		const state = this.getState(endpoint);
		state.successes++;
		if (state.successes < 4) {
			return;
		}
		state.files = Math.min(state.ceiling.files, state.files + 1);
		state.directories = Math.min(state.ceiling.directories, state.directories + 1);
		state.successes = 0;
	}

	private getState(endpoint: ITurboFileTransferEndpoint): IDeviceConcurrencyState {
		const key = getTurboFileTransferDeviceKey(endpoint);
		let state = this.states.get(key);
		const observed = getInitialLimits(endpoint);
		if (!state) {
			state = { ...observed, successes: 0, ceiling: observed };
			this.states.set(key, state);
		} else if (observed.files < state.ceiling.files || observed.directories < state.ceiling.directories) {
			state.ceiling = {
				files: Math.min(state.ceiling.files, observed.files),
				directories: Math.min(state.ceiling.directories, observed.directories)
			};
			state.files = Math.min(state.files, state.ceiling.files);
			state.directories = Math.min(state.directories, state.ceiling.directories);
		}
		return state;
	}
}

export function getTurboFileTransferDeviceKey(endpoint: ITurboFileTransferEndpoint): string {
	if (endpoint.kind === 'local') {
		return 'local';
	}
	const connection = endpoint.connection;
	return connection
		? `ssh:${connection.username.trim()}@${connection.host.trim().toLowerCase()}:${connection.port || 22}`
		: `ssh:${endpoint.label?.trim().toLowerCase() || 'unknown'}`;
}

export function getTurboFileTransferPathKey(endpoint: ITurboFileTransferEndpoint, scope: 'path' | 'parent' = 'path'): string {
	const normalized = normalizePath(endpoint.path, endpoint.kind === 'local');
	const path = scope === 'parent' ? getParentPath(normalized) : normalized;
	return `path:${getTurboFileTransferDeviceKey(endpoint)}|${path}`;
}

/**
 * Builds bounded source-path claims for a batch. Small batches keep exact paths;
 * large selections first collapse to parent directories and finally to their
 * common ancestor. This preserves non-first-item conflict detection without
 * making queue conflict checks quadratic for ten-thousand-file selections.
 */
export function getTurboFileTransferBatchPathKeys(endpoint: ITurboFileTransferEndpoint, paths: readonly string[]): readonly string[] {
	const exact = getUniquePathKeys(endpoint, paths, 'path');
	if (exact.length <= MAX_BATCH_PATH_CLAIMS) {
		return exact;
	}
	const parents = getUniquePathKeys(endpoint, paths, 'parent');
	if (parents.length <= MAX_BATCH_PATH_CLAIMS) {
		return parents;
	}
	const normalizedPaths = paths.map(path => normalizePath(path, endpoint.kind === 'local'));
	const commonPath = getCommonAncestorPath(normalizedPaths);
	return commonPath === undefined
		? parents
		: [getTurboFileTransferPathKey({ ...endpoint, path: commonPath }, 'path')];
}

function getUniquePathKeys(endpoint: ITurboFileTransferEndpoint, paths: readonly string[], scope: 'path' | 'parent'): string[] {
	return [...new Set(paths.filter(Boolean).map(path => getTurboFileTransferPathKey({ ...endpoint, path }, scope)))];
}

function getCommonAncestorPath(paths: readonly string[]): string | undefined {
	if (paths.length === 0) {
		return undefined;
	}
	const absolute = paths[0].startsWith('/');
	if (paths.some(path => path.startsWith('/') !== absolute)) {
		return undefined;
	}
	const components = paths.map(path => path.split('/').filter(Boolean));
	let commonLength = components[0].length;
	for (let pathIndex = 1; pathIndex < components.length && commonLength > 0; pathIndex++) {
		commonLength = Math.min(commonLength, components[pathIndex].length);
		let componentIndex = 0;
		while (componentIndex < commonLength && components[0][componentIndex] === components[pathIndex][componentIndex]) {
			componentIndex++;
		}
		commonLength = componentIndex;
	}
	if (commonLength === 0) {
		return absolute ? '/' : undefined;
	}
	const common = components[0].slice(0, commonLength).join('/');
	return absolute ? `/${common}` : common;
}

function getInitialLimits(endpoint: ITurboFileTransferEndpoint): ITurboFileBatchConcurrencyLimits {
	return isSharedStorageEndpoint(endpoint) ? SHARED_STORAGE_LIMITS : STANDARD_LIMITS;
}

function isSharedStorageEndpoint(endpoint: ITurboFileTransferEndpoint): boolean {
	if (endpoint.kind !== 'ssh') {
		return false;
	}
	const path = normalizePath(endpoint.path, false);
	return /^\/(?:volume\d+|var\/services)(?:\/|$)/.test(path);
}

function normalizePath(path: string, caseInsensitive: boolean): string {
	let normalized = path.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
	if (normalized.length > 1) {
		normalized = normalized.replace(/\/$/, '');
	}
	return caseInsensitive ? normalized.toLowerCase() : normalized;
}

function getParentPath(path: string): string {
	const separator = path.lastIndexOf('/');
	if (separator === 0) {
		return '/';
	}
	if (separator < 0) {
		return path;
	}
	return path.slice(0, separator);
}
