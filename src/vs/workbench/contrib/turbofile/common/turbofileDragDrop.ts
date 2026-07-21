/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

type TurboFilePaneSide = 'left' | 'right';

export type TurboFileDragOperation = 'copy' | 'move';

export function resolveTurboFileDragOperation(value: string | undefined, fallback: TurboFileDragOperation): TurboFileDragOperation {
	return value === 'copy' || value === 'move' ? value : fallback;
}

export function getTurboFileDropEffect(operation: TurboFileDragOperation): 'copy' | 'move' {
	return operation;
}

export function getNextTurboFileDragOperation(operation: TurboFileDragOperation): TurboFileDragOperation {
	return operation === 'copy' ? 'move' : 'copy';
}

export function getTurboFileRowDragEffectAllowed(): 'copyMove' {
	return 'copyMove';
}

export function shouldHandleTurboFilePaneDropAtPage(sourceSide: TurboFilePaneSide | undefined, targetSide: TurboFilePaneSide): boolean {
	return sourceSide === undefined || sourceSide !== targetSide;
}

export function getTurboFileDirectoryMoveRefreshPaths(sourceDir: string, targetDir: string): string[] {
	return sourceDir === targetDir ? [sourceDir] : [sourceDir, targetDir];
}
