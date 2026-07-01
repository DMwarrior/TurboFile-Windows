/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export async function normalizeWindowsTransferPaths(paths, resolvePath) {
    const result = [];
    const seen = new Set();
    for (const rawPath of paths) {
        const candidate = normalizeWindowsTransferPath(rawPath);
        if (!candidate) {
            continue;
        }
        const resolved = normalizeWindowsTransferPath(await resolvePath(candidate).catch(() => candidate)) ?? candidate;
        const key = getWindowsTransferPathKey(resolved);
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        result.push(resolved);
    }
    return result;
}
export function getWindowsTransferPathKey(path) {
    return path.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
}
function normalizeWindowsTransferPath(path) {
    const trimmed = path.trim().replace(/^"|"$/g, '').replace(/^file:\/\/\/?/i, '');
    return trimmed || undefined;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHVyYm9maWxlV2luZG93c1BhdGguanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9EOi9Xb3JrL0NvZGUvVHVyYm9GaWxlLVdpbmRvd3Mvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vdHVyYm9maWxlL2NvbW1vbi90dXJib2ZpbGVXaW5kb3dzUGF0aC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUloRyxNQUFNLENBQUMsS0FBSyxVQUFVLDZCQUE2QixDQUFDLEtBQXdCLEVBQUUsV0FBZ0M7SUFDN0csTUFBTSxNQUFNLEdBQWEsRUFBRSxDQUFDO0lBQzVCLE1BQU0sSUFBSSxHQUFHLElBQUksR0FBRyxFQUFVLENBQUM7SUFFL0IsS0FBSyxNQUFNLE9BQU8sSUFBSSxLQUFLLEVBQUUsQ0FBQztRQUM3QixNQUFNLFNBQVMsR0FBRyw0QkFBNEIsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUN4RCxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDaEIsU0FBUztRQUNWLENBQUM7UUFFRCxNQUFNLFFBQVEsR0FBRyw0QkFBNEIsQ0FBQyxNQUFNLFdBQVcsQ0FBQyxTQUFTLENBQUMsQ0FBQyxLQUFLLENBQUMsR0FBRyxFQUFFLENBQUMsU0FBUyxDQUFDLENBQUMsSUFBSSxTQUFTLENBQUM7UUFDaEgsTUFBTSxHQUFHLEdBQUcseUJBQXlCLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDaEQsSUFBSSxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7WUFDbkIsU0FBUztRQUNWLENBQUM7UUFFRCxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ2QsTUFBTSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUN2QixDQUFDO0lBRUQsT0FBTyxNQUFNLENBQUM7QUFDZixDQUFDO0FBRUQsTUFBTSxVQUFVLHlCQUF5QixDQUFDLElBQVk7SUFDckQsT0FBTyxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxJQUFJLENBQUMsQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxDQUFDLFdBQVcsRUFBRSxDQUFDO0FBQ3BFLENBQUM7QUFFRCxTQUFTLDRCQUE0QixDQUFDLElBQVk7SUFDakQsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLGdCQUFnQixFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQ2hGLE9BQU8sT0FBTyxJQUFJLFNBQVMsQ0FBQztBQUM3QixDQUFDIn0=