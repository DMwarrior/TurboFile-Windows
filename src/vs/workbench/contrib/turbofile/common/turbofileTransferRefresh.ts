/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type TurboFilePaneSide = 'left' | 'right';

export function createTurboFilePostTransferRefreshPlan(
	operation: 'copy' | 'move',
	sourceSide: TurboFilePaneSide,
	targetSide: TurboFilePaneSide
): readonly TurboFilePaneSide[] {
	if (operation === 'copy') {
		return [targetSide];
	}
	return sourceSide === targetSide ? [targetSide] : [sourceSide, targetSide];
}
