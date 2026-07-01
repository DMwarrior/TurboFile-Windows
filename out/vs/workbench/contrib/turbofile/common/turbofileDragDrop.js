/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export function getTurboFileRowDragEffectAllowed() {
    return 'copyMove';
}
export function shouldHandleTurboFilePaneDropAtPage(sourceSide, targetSide) {
    return sourceSide === undefined || sourceSide !== targetSide;
}
export function getTurboFileDirectoryMoveRefreshPaths(sourceDir, targetDir) {
    return sourceDir === targetDir ? [sourceDir] : [sourceDir, targetDir];
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHVyYm9maWxlRHJhZ0Ryb3AuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9EOi9Xb3JrL0NvZGUvVHVyYm9GaWxlLVdpbmRvd3Mvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdHVyYm9maWxlL2NvbW1vbi90dXJib2ZpbGVEcmFnRHJvcC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUloRyxNQUFNLFVBQVUsZ0NBQWdDO0lBQy9DLE9BQU8sVUFBVSxDQUFDO0FBQ25CLENBQUM7QUFFRCxNQUFNLFVBQVUsbUNBQW1DLENBQUMsVUFBeUMsRUFBRSxVQUE2QjtJQUMzSCxPQUFPLFVBQVUsS0FBSyxTQUFTLElBQUksVUFBVSxLQUFLLFVBQVUsQ0FBQztBQUM5RCxDQUFDO0FBRUQsTUFBTSxVQUFVLHFDQUFxQyxDQUFDLFNBQWlCLEVBQUUsU0FBaUI7SUFDekYsT0FBTyxTQUFTLEtBQUssU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsRUFBRSxTQUFTLENBQUMsQ0FBQztBQUN2RSxDQUFDIn0=