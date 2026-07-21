/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { TurboFileFileType } from '../../../../platform/turbofile/common/turbofile.js';

export type TurboFileSortKey = 'name' | 'modified' | 'type' | 'size';
export type TurboFileSortDirection = 'ascending' | 'descending';

export interface TurboFileSortableItem {
	readonly name: string;
	readonly rawSize: number;
	readonly rawModified: number;
	readonly type: TurboFileFileType;
	readonly directory?: boolean;
	readonly parent?: boolean;
	readonly attrsPending?: boolean;
}

export function turboFileSortNeedsAttributes(key: TurboFileSortKey): boolean {
	return key === 'modified' || key === 'size';
}

export function isTurboFileListingReadyForSort(items: readonly TurboFileSortableItem[], key: TurboFileSortKey): boolean {
	return !turboFileSortNeedsAttributes(key) || !items.some(item => !item.parent && item.attrsPending);
}

export function sortTurboFileItems<T extends TurboFileSortableItem>(items: readonly T[], key: TurboFileSortKey, direction: TurboFileSortDirection): T[] {
	return [...items].sort((left, right) => compareTurboFileItems(left, right, key, direction));
}

function compareTurboFileItems(left: TurboFileSortableItem, right: TurboFileSortableItem, key: TurboFileSortKey, direction: TurboFileSortDirection): number {
	if (!!left.parent !== !!right.parent) {
		return left.parent ? -1 : 1;
	}
	if (!!left.directory !== !!right.directory) {
		return left.directory ? -1 : 1;
	}

	const comparison = compareTurboFileItemsByKey(left, right, key);
	const directed = direction === 'descending' ? -comparison : comparison;
	return directed || compareNames(left.name, right.name);
}

function compareTurboFileItemsByKey(left: TurboFileSortableItem, right: TurboFileSortableItem, key: TurboFileSortKey): number {
	switch (key) {
		case 'modified':
			return compareNumbers(left.rawModified, right.rawModified);
		case 'size':
			return compareNumbers(left.rawSize, right.rawSize);
		case 'type':
			return compareNames(getTypeSortKey(left), getTypeSortKey(right));
		case 'name':
		default:
			return compareNames(left.name, right.name);
	}
}

function compareNumbers(left: number, right: number): number {
	return (left || 0) - (right || 0);
}

function compareNames(left: string, right: string): number {
	return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
}

function getTypeSortKey(item: TurboFileSortableItem): string {
	if (item.directory) {
		return 'directory';
	}
	const dotIndex = item.name.lastIndexOf('.');
	return dotIndex >= 0 && dotIndex < item.name.length - 1 ? item.name.substring(dotIndex + 1).toLowerCase() : item.type;
}
