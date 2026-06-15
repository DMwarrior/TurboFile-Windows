/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const TURBOFILE_WINDOWS_DRAG_FAKE_DIR_PREFIX = 'TurboFileDrop-';
export const TURBOFILE_WINDOWS_DRAG_APP_DIR = 'TurboFile';
export const TURBOFILE_WINDOWS_DRAG_ROOT_DIR = 'DragDrop';
export const TURBOFILE_WINDOWS_DRAG_ACTIVE_DIR = 'Active';
export const TURBOFILE_WINDOWS_DRAG_TARGETS_DIR = 'Targets';

const VALID_WINDOWS_DRAG_TOKEN = /^[A-Za-z0-9_-]{6,128}$/;

export function isValidWindowsDragToken(token: string): boolean {
	return VALID_WINDOWS_DRAG_TOKEN.test(token);
}

export function createWindowsDragFakeDirectoryName(token: string): string {
	if (!isValidWindowsDragToken(token)) {
		throw new Error('Invalid TurboFile Windows drag token.');
	}
	return `${TURBOFILE_WINDOWS_DRAG_FAKE_DIR_PREFIX}${token}`;
}

export function extractWindowsDragTokenFromFakeDirectoryPath(path: string): string | undefined {
	const normalized = path.replace(/[\\/]+$/g, '');
	const name = normalized.split(/[\\/]/).pop() ?? '';
	if (!name.startsWith(TURBOFILE_WINDOWS_DRAG_FAKE_DIR_PREFIX)) {
		return undefined;
	}

	const token = name.slice(TURBOFILE_WINDOWS_DRAG_FAKE_DIR_PREFIX.length);
	return isValidWindowsDragToken(token) ? token : undefined;
}

export function normalizeWindowsCopyHookDestination(destination: string, fakeDirectoryName: string): string {
	let normalized = destination.replace(/[\\/]+$/g, '');
	if (/^[A-Za-z]:$/.test(normalized)) {
		return `${normalized}\\`;
	}

	const parts = normalized.split(/[\\/]/);
	if (parts.length > 1 && equalsIgnoreCase(parts[parts.length - 1], fakeDirectoryName)) {
		parts.pop();
		normalized = parts.join('\\');
		if (/^[A-Za-z]:$/.test(normalized)) {
			return `${normalized}\\`;
		}
	}

	return normalized || destination;
}

export function createWindowsShellAssociationChangedScript(): string {
	return String.raw`
Add-Type -Namespace TurboFile -Name NativeShell -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("shell32.dll")]
public static extern void SHChangeNotify(uint wEventId, uint uFlags, System.IntPtr dwItem1, System.IntPtr dwItem2);
'@
[TurboFile.NativeShell]::SHChangeNotify(0x08000000, 0, [System.IntPtr]::Zero, [System.IntPtr]::Zero)
`;
}

function equalsIgnoreCase(left: string, right: string): boolean {
	return left.localeCompare(right, undefined, { sensitivity: 'accent' }) === 0;
}
