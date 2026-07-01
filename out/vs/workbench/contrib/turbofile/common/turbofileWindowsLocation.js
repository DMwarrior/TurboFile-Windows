/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export function shouldRetargetWindowsDesktopPane(currentPath, previousDesktopPath, profileDesktopPath) {
    return isSameWindowsPath(currentPath, previousDesktopPath) || isSameWindowsPath(currentPath, profileDesktopPath);
}
function isSameWindowsPath(left, right) {
    return getWindowsPathKey(left) === getWindowsPathKey(right);
}
function getWindowsPathKey(path) {
    return path.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHVyYm9maWxlV2luZG93c0xvY2F0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vRDovV29yay9Db2RlL1R1cmJvRmlsZS1XaW5kb3dzL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3R1cmJvZmlsZS9jb21tb24vdHVyYm9maWxlV2luZG93c0xvY2F0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE1BQU0sVUFBVSxnQ0FBZ0MsQ0FBQyxXQUFtQixFQUFFLG1CQUEyQixFQUFFLGtCQUEwQjtJQUM1SCxPQUFPLGlCQUFpQixDQUFDLFdBQVcsRUFBRSxtQkFBbUIsQ0FBQyxJQUFJLGlCQUFpQixDQUFDLFdBQVcsRUFBRSxrQkFBa0IsQ0FBQyxDQUFDO0FBQ2xILENBQUM7QUFFRCxTQUFTLGlCQUFpQixDQUFDLElBQVksRUFBRSxLQUFhO0lBQ3JELE9BQU8saUJBQWlCLENBQUMsSUFBSSxDQUFDLEtBQUssaUJBQWlCLENBQUMsS0FBSyxDQUFDLENBQUM7QUFDN0QsQ0FBQztBQUVELFNBQVMsaUJBQWlCLENBQUMsSUFBWTtJQUN0QyxPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLENBQUMsV0FBVyxFQUFFLENBQUM7QUFDcEUsQ0FBQyJ9