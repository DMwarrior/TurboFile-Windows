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
}

export function createLocalBatchTarPlans(items: readonly ITurboFileBatchTransferItem[]): readonly ITurboFileBatchTarPlan[] | undefined {
	if (!items.length) {
		return undefined;
	}

	const plans = new Map<string, { parentPath: string; names: string[]; targetNames: string[] }>();
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
			plan = { parentPath, names: [], targetNames: [] };
			plans.set(parentPath, plan);
		}
		plan.names.push(sourceName);
		plan.targetNames.push(item.targetName);
	}

	return Array.from(plans.values());
}

export function createTarNullListBuffer(entries: readonly string[]): Buffer {
	return Buffer.from(`${entries.join('\0')}\0`, 'utf8');
}

function trimTrailingPathSeparators(path: string): string {
	return path.replace(/[\\/]+$/g, '');
}
