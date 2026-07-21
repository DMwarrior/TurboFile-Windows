/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type TurboFileImageGridSortKey = 'name' | 'date' | 'type' | 'size';

export interface ITurboFileImageGridSortableItem {
	readonly name: string;
	readonly modified: number;
	readonly modifiedKnown: boolean;
	readonly rawSize: number;
	readonly sizeKnown: boolean;
}

const imageGridSortCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export function sortTurboFileImageGridItems<T extends ITurboFileImageGridSortableItem>(items: readonly T[], key: TurboFileImageGridSortKey, descending: boolean): T[] {
	return [...items].sort((left, right) => compareTurboFileImageGridItems(left, right, key, descending));
}

function compareTurboFileImageGridItems(left: ITurboFileImageGridSortableItem, right: ITurboFileImageGridSortableItem, key: TurboFileImageGridSortKey, descending: boolean): number {
	if (key === 'date') {
		return compareOptionalNumbers(
			left.modifiedKnown && Number.isFinite(left.modified) ? left.modified : undefined,
			right.modifiedKnown && Number.isFinite(right.modified) ? right.modified : undefined,
			left.name,
			right.name,
			descending
		);
	}
	if (key === 'size') {
		return compareOptionalNumbers(
			left.sizeKnown && Number.isFinite(left.rawSize) ? left.rawSize : undefined,
			right.sizeKnown && Number.isFinite(right.rawSize) ? right.rawSize : undefined,
			left.name,
			right.name,
			descending
		);
	}

	let comparison = key === 'type'
		? imageGridSortCollator.compare(getFileExtensionLower(left.name), getFileExtensionLower(right.name))
		: imageGridSortCollator.compare(left.name, right.name);
	if (comparison === 0 && key !== 'name') {
		comparison = imageGridSortCollator.compare(left.name, right.name);
	}
	return descending ? -comparison : comparison;
}

function compareOptionalNumbers(left: number | undefined, right: number | undefined, leftName: string, rightName: string, descending: boolean): number {
	const leftKnown = left !== undefined;
	const rightKnown = right !== undefined;
	if (leftKnown !== rightKnown) {
		return leftKnown ? -1 : 1;
	}
	if (!leftKnown || !rightKnown) {
		return imageGridSortCollator.compare(leftName, rightName);
	}
	const comparison = left - right;
	if (comparison === 0) {
		return imageGridSortCollator.compare(leftName, rightName);
	}
	return descending ? -comparison : comparison;
}

function getFileExtensionLower(name: string): string {
	const dotIndex = name.lastIndexOf('.');
	return dotIndex > 0 && dotIndex < name.length - 1 ? name.slice(dotIndex + 1).toLowerCase() : '';
}
