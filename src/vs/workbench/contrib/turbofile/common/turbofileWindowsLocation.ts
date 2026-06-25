/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function shouldRetargetWindowsDesktopPane(currentPath: string, previousDesktopPath: string, profileDesktopPath: string): boolean {
	return isSameWindowsPath(currentPath, previousDesktopPath) || isSameWindowsPath(currentPath, profileDesktopPath);
}

function isSameWindowsPath(left: string, right: string): boolean {
	return getWindowsPathKey(left) === getWindowsPathKey(right);
}

function getWindowsPathKey(path: string): string {
	return path.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
}
