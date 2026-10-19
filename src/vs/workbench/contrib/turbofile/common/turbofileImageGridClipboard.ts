/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

type TurboFilePaneSide = 'left' | 'right';

/** Paste follows the focused grid, including navigation on the same device and external files. */
export function getTurboFileImageGridPasteTargetSide(gridSide: TurboFilePaneSide, _clipboardSourceSide: TurboFilePaneSide | undefined): TurboFilePaneSide {
	return gridSide;
}
