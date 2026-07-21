/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export function resolveTurboFileDragOperation(value, fallback) {
    return value === 'copy' || value === 'move' ? value : fallback;
}
export function getTurboFileDropEffect(operation) {
    return operation;
}
export function getNextTurboFileDragOperation(operation) {
    return operation === 'copy' ? 'move' : 'copy';
}
export function getTurboFileRowDragEffectAllowed() {
    return 'copyMove';
}
export function shouldHandleTurboFilePaneDropAtPage(sourceSide, targetSide) {
    return sourceSide === undefined || sourceSide !== targetSide;
}
export function getTurboFileDirectoryMoveRefreshPaths(sourceDir, targetDir) {
    return sourceDir === targetDir ? [sourceDir] : [sourceDir, targetDir];
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHVyYm9maWxlRHJhZ0Ryb3AuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9EOi9Xb3JrL0NvZGUvVHVyYm9GaWxlLVdpbmRvd3Mvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdHVyYm9maWxlL2NvbW1vbi90dXJib2ZpbGVEcmFnRHJvcC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQU1oRyxNQUFNLFVBQVUsNkJBQTZCLENBQUMsS0FBeUIsRUFBRSxRQUFnQztJQUN4RyxPQUFPLEtBQUssS0FBSyxNQUFNLElBQUksS0FBSyxLQUFLLE1BQU0sQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUM7QUFDaEUsQ0FBQztBQUVELE1BQU0sVUFBVSxzQkFBc0IsQ0FBQyxTQUFpQztJQUN2RSxPQUFPLFNBQVMsQ0FBQztBQUNsQixDQUFDO0FBRUQsTUFBTSxVQUFVLDZCQUE2QixDQUFDLFNBQWlDO0lBQzlFLE9BQU8sU0FBUyxLQUFLLE1BQU0sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUM7QUFDL0MsQ0FBQztBQUVELE1BQU0sVUFBVSxnQ0FBZ0M7SUFDL0MsT0FBTyxVQUFVLENBQUM7QUFDbkIsQ0FBQztBQUVELE1BQU0sVUFBVSxtQ0FBbUMsQ0FBQyxVQUF5QyxFQUFFLFVBQTZCO0lBQzNILE9BQU8sVUFBVSxLQUFLLFNBQVMsSUFBSSxVQUFVLEtBQUssVUFBVSxDQUFDO0FBQzlELENBQUM7QUFFRCxNQUFNLFVBQVUscUNBQXFDLENBQUMsU0FBaUIsRUFBRSxTQUFpQjtJQUN6RixPQUFPLFNBQVMsS0FBSyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxFQUFFLFNBQVMsQ0FBQyxDQUFDO0FBQ3ZFLENBQUMifQ==