/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

type TurboFilePaneSide = 'left' | 'right';

export function getTurboFileImageGridPasteTargetSide(gridSide: TurboFilePaneSide, clipboardSourceSide: TurboFilePaneSide | undefined): TurboFilePaneSide {
	if (clipboardSourceSide && clipboardSourceSide !== gridSide) {
		return gridSide;
	}
	return gridSide === 'left' ? 'right' : 'left';
}
