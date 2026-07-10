/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type TurboFilePaneSide = 'left' | 'right';

export interface ITurboFilePostTransferRefreshPlan {
	readonly sides: readonly TurboFilePaneSide[];
	readonly sequential: boolean;
}

export function createTurboFilePostTransferRefreshPlan(
	operation: 'copy' | 'move',
	sourceSide: TurboFilePaneSide,
	targetSide: TurboFilePaneSide,
	sameDevice: boolean
): ITurboFilePostTransferRefreshPlan {
	if (operation === 'copy') {
		return { sides: [targetSide], sequential: false };
	}

	const sides: TurboFilePaneSide[] = sourceSide === targetSide ? [targetSide] : [sourceSide, targetSide];
	return {
		sides,
		sequential: sameDevice && sides.length > 1
	};
}
