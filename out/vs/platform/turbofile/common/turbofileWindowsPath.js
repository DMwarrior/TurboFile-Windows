/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const WINDOWS_PATH_RESOLVE_CONCURRENCY = 16;
export async function normalizeWindowsTransferPaths(paths, resolvePath) {
    const candidates = [];
    const seenCandidates = new Set();
    for (const rawPath of paths) {
        const candidate = normalizeWindowsTransferPath(rawPath);
        if (!candidate) {
            continue;
        }
        const candidateKey = getWindowsTransferPathKey(candidate);
        if (seenCandidates.has(candidateKey)) {
            continue;
        }
        seenCandidates.add(candidateKey);
        candidates.push(candidate);
    }
    // Explorer may hand us tens of thousands of paths. Resolve a bounded number in parallel so
    // normalisation does not become a long serial pre-transfer phase or flood libuv's worker pool.
    const resolvedPaths = new Array(candidates.length);
    let cursor = 0;
    const worker = async () => {
        while (cursor < candidates.length) {
            const index = cursor++;
            const candidate = candidates[index];
            resolvedPaths[index] = normalizeWindowsTransferPath(await resolvePath(candidate).catch(() => candidate)) ?? candidate;
        }
    };
    await Promise.all(Array.from({ length: Math.min(WINDOWS_PATH_RESOLVE_CONCURRENCY, candidates.length) }, () => worker()));
    const result = [];
    const seen = new Set();
    for (const resolved of resolvedPaths) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHVyYm9maWxlV2luZG93c1BhdGguanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9EOi9Xb3JrL0NvZGUvVHVyYm9GaWxlLVdpbmRvd3Mvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vdHVyYm9maWxlL2NvbW1vbi90dXJib2ZpbGVXaW5kb3dzUGF0aC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUloRyxNQUFNLGdDQUFnQyxHQUFHLEVBQUUsQ0FBQztBQUU1QyxNQUFNLENBQUMsS0FBSyxVQUFVLDZCQUE2QixDQUFDLEtBQXdCLEVBQUUsV0FBZ0M7SUFDN0csTUFBTSxVQUFVLEdBQWEsRUFBRSxDQUFDO0lBQ2hDLE1BQU0sY0FBYyxHQUFHLElBQUksR0FBRyxFQUFVLENBQUM7SUFDekMsS0FBSyxNQUFNLE9BQU8sSUFBSSxLQUFLLEVBQUUsQ0FBQztRQUM3QixNQUFNLFNBQVMsR0FBRyw0QkFBNEIsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUN4RCxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDaEIsU0FBUztRQUNWLENBQUM7UUFDRCxNQUFNLFlBQVksR0FBRyx5QkFBeUIsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUMxRCxJQUFJLGNBQWMsQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLEVBQUUsQ0FBQztZQUN0QyxTQUFTO1FBQ1YsQ0FBQztRQUNELGNBQWMsQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDakMsVUFBVSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQztJQUM1QixDQUFDO0lBRUQsMkZBQTJGO0lBQzNGLCtGQUErRjtJQUMvRixNQUFNLGFBQWEsR0FBRyxJQUFJLEtBQUssQ0FBUyxVQUFVLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDM0QsSUFBSSxNQUFNLEdBQUcsQ0FBQyxDQUFDO0lBQ2YsTUFBTSxNQUFNLEdBQUcsS0FBSyxJQUFtQixFQUFFO1FBQ3hDLE9BQU8sTUFBTSxHQUFHLFVBQVUsQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNuQyxNQUFNLEtBQUssR0FBRyxNQUFNLEVBQUUsQ0FBQztZQUN2QixNQUFNLFNBQVMsR0FBRyxVQUFVLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDcEMsYUFBYSxDQUFDLEtBQUssQ0FBQyxHQUFHLDRCQUE0QixDQUFDLE1BQU0sV0FBVyxDQUFDLFNBQVMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsQ0FBQyxTQUFTLENBQUMsQ0FBQyxJQUFJLFNBQVMsQ0FBQztRQUN2SCxDQUFDO0lBQ0YsQ0FBQyxDQUFDO0lBQ0YsTUFBTSxPQUFPLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsRUFBRSxNQUFNLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxnQ0FBZ0MsRUFBRSxVQUFVLENBQUMsTUFBTSxDQUFDLEVBQUUsRUFBRSxHQUFHLEVBQUUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFFekgsTUFBTSxNQUFNLEdBQWEsRUFBRSxDQUFDO0lBQzVCLE1BQU0sSUFBSSxHQUFHLElBQUksR0FBRyxFQUFVLENBQUM7SUFDL0IsS0FBSyxNQUFNLFFBQVEsSUFBSSxhQUFhLEVBQUUsQ0FBQztRQUN0QyxNQUFNLEdBQUcsR0FBRyx5QkFBeUIsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUNoRCxJQUFJLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztZQUNuQixTQUFTO1FBQ1YsQ0FBQztRQUVELElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7UUFDZCxNQUFNLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQ3ZCLENBQUM7SUFFRCxPQUFPLE1BQU0sQ0FBQztBQUNmLENBQUM7QUFFRCxNQUFNLFVBQVUseUJBQXlCLENBQUMsSUFBWTtJQUNyRCxPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLENBQUMsV0FBVyxFQUFFLENBQUM7QUFDcEUsQ0FBQztBQUVELFNBQVMsNEJBQTRCLENBQUMsSUFBWTtJQUNqRCxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUMsT0FBTyxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsZ0JBQWdCLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFDaEYsT0FBTyxPQUFPLElBQUksU0FBUyxDQUFDO0FBQzdCLENBQUMifQ==