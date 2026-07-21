/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITurboFileTrashItem } from '../../../../platform/turbofile/common/turbofile.js';
import { sortTurboFileTrashItems } from '../../../../platform/turbofile/common/turbofileTrash.js';

export interface TurboFileTrashPaneMode {
	readonly active: boolean;
	readonly returnPath?: string;
	readonly browseItem?: ITurboFileTrashItem;
	readonly browsePath?: string;
}

export interface TurboFileTrashRow {
	readonly id: string;
	readonly name: string;
	readonly originalPath: string;
	readonly deletedAt: number;
	readonly type: ITurboFileTrashItem['type'];
	readonly knownSize?: number;
	readonly rawSize: number;
	readonly rawModified: number;
	readonly directory: boolean;
	readonly parent: false;
	readonly item: ITurboFileTrashItem;
}

export function enterTurboFileTrashView(returnPath: string): TurboFileTrashPaneMode {
	return {
		active: true,
		returnPath
	};
}

export function leaveTurboFileTrashView(): TurboFileTrashPaneMode {
	return {
		active: false
	};
}

export function enterTurboFileTrashDirectory(mode: TurboFileTrashPaneMode, item: ITurboFileTrashItem, path: string = item.payloadPath): TurboFileTrashPaneMode {
	return {
		...mode,
		active: true,
		browseItem: item,
		browsePath: path
	};
}

export function leaveTurboFileTrashDirectory(mode: TurboFileTrashPaneMode): TurboFileTrashPaneMode {
	return {
		active: true,
		returnPath: mode.returnPath
	};
}

export function isTurboFileTrashRootView(mode: TurboFileTrashPaneMode): boolean {
	return mode.active && !mode.browseItem && !mode.browsePath;
}

export function getTurboFileTrashRowHeight(_mode: TurboFileTrashPaneMode): number {
	return 30;
}

export function isTurboFileTrashBrowsePathAllowed(rootPath: string, candidatePath: string, windowsPath: boolean): boolean {
	const separator = windowsPath ? '\\' : '/';
	const normalize = (path: string): string => {
		const separated = windowsPath ? path.replace(/\//g, '\\') : path.replace(/\\/g, '/');
		const trimmed = separated.length > 1 ? separated.replace(/[\\/]+$/, '') : separated;
		return windowsPath ? trimmed.toLocaleLowerCase() : trimmed;
	};
	const root = normalize(rootPath);
	const candidate = normalize(candidatePath);
	return candidate === root || candidate.startsWith(`${root}${separator}`);
}

export function mapTurboFileTrashItemsToRows(items: readonly ITurboFileTrashItem[]): TurboFileTrashRow[] {
	return sortTurboFileTrashItems(items).map(item => ({
		id: item.id,
		name: item.originalName,
		originalPath: item.originalPath,
		deletedAt: item.deletedAt,
		type: item.type,
		knownSize: item.knownSize,
		rawSize: item.knownSize ?? 0,
		rawModified: item.deletedAt,
		directory: item.type === 'directory',
		parent: false,
		item
	}));
}
