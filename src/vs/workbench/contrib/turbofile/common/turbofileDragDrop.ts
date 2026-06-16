/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

type TurboFilePaneSide = 'left' | 'right';

export function getTurboFileRowDragEffectAllowed(): 'copyMove' {
	return 'copyMove';
}

export function shouldHandleTurboFilePaneDropAtPage(sourceSide: TurboFilePaneSide | undefined, targetSide: TurboFilePaneSide): boolean {
	return sourceSide === undefined || sourceSide !== targetSide;
}
