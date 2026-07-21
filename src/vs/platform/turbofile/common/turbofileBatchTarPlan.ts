/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { basename, dirname } from '../../../base/common/path.js';
import type { ITurboFileBatchTransferItem } from './turbofile.js';

export interface ITurboFileBatchTarPlan {
	readonly parentPath: string;
	readonly names: readonly string[];
	readonly targetNames: readonly string[];
	readonly fileNames: readonly string[];
	readonly directoryNames: readonly string[];
	readonly unknownNames: readonly string[];
	readonly requiresSafeParentPath?: boolean;
	readonly containsDirectories?: boolean;
}

export interface ITurboFileBatchTarSourcePlan {
	readonly command: string;
	readonly input?: Uint8Array;
}

/**
 * Keep inline commands comfortably below platform ARG_MAX and the smaller
 * per-argument limit applied to the shell's `-c` command string.
 */
export const TURBOFILE_BATCH_COMMAND_SAFE_BYTES = 32 * 1024;

export function createLocalBatchTarPlans(items: readonly ITurboFileBatchTransferItem[]): readonly ITurboFileBatchTarPlan[] | undefined {
	if (!items.length) {
		return undefined;
	}

	const plans = new Map<string, { parentPath: string; names: string[]; targetNames: string[]; fileNames: string[]; directoryNames: string[]; unknownNames: string[]; requiresSafeParentPath?: boolean; containsDirectories?: boolean }>();
	const seenTargetNames = new Set<string>();

	for (const item of items) {
		const sourcePath = trimTrailingPathSeparators(item.sourcePath);
		const sourceName = basename(sourcePath);
		if (!sourceName || item.targetName !== sourceName) {
			return undefined;
		}
		if (seenTargetNames.has(item.targetName)) {
			throw new Error(`Duplicate target name in batch tar transfer: ${item.targetName}`);
		}
		seenTargetNames.add(item.targetName);

		const parentPath = dirname(sourcePath);
		let plan = plans.get(parentPath);
		if (!plan) {
			plan = {
				parentPath,
				names: [],
				targetNames: [],
				fileNames: [],
				directoryNames: [],
				unknownNames: [],
				...(requiresLocalTarSafeRootAlias(parentPath) ? { requiresSafeParentPath: true } : undefined)
			};
			plans.set(parentPath, plan);
		}
		plan.names.push(sourceName);
		plan.targetNames.push(item.targetName);
		if (item.sourceType === 'directory') {
			plan.directoryNames.push(sourceName);
			plan.containsDirectories = true;
		} else if (item.sourceType === 'file') {
			plan.fileNames.push(sourceName);
		} else {
			plan.unknownNames.push(sourceName);
		}
	}

	return Array.from(plans.values());
}

export function createTarNullListBuffer(entries: readonly string[]): Uint8Array {
	if (entries.some(entry => entry.includes('\0'))) {
		throw new Error('Tar manifest entries cannot contain NUL characters.');
	}
	return new TextEncoder().encode(entries.length ? `${entries.join('\0')}\0` : '');
}

export function createRemoteBatchTarSourcePlan(parentPath: string, names: readonly string[]): ITurboFileBatchTarSourcePlan {
	const inlineCommand = `command -v tar >/dev/null 2>&1 && tar -cf - -C ${quotePosixShellArg(parentPath)} -- ${names.map(quotePosixShellArg).join(' ')}`;
	if (isTurboFileBatchCommandSafe(inlineCommand)) {
		return { command: inlineCommand };
	}

	return {
		command: `command -v tar >/dev/null 2>&1 && tar -cf - -C ${quotePosixShellArg(parentPath)} --null -T -`,
		input: createTarNullListBuffer(names)
	};
}

export function isTurboFileBatchCommandSafe(command: string): boolean {
	return new TextEncoder().encode(command).byteLength <= TURBOFILE_BATCH_COMMAND_SAFE_BYTES;
}

export function requiresLocalTarSafeRootAlias(path: string): boolean {
	return /[^\x20-\x7E]/.test(path);
}

function trimTrailingPathSeparators(path: string): string {
	return path.replace(/[\\/]+$/g, '');
}

function quotePosixShellArg(value: string): string {
	return `'${value.replace(/'/g, `'"'"'`)}'`;
}
