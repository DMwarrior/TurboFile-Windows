/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { normalizeWindowsTransferPaths } from '../../common/turbofileWindowsPath.js';
suite('TurboFileWindowsPath', () => {
    test('deduplicates Windows short and long names after realpath resolution', async () => {
        const paths = await normalizeWindowsTransferPaths([
            'C:\\Users\\me\\Desktop\\BAOYU_~1',
            'C:\\Users\\me\\Desktop\\BaoYu_1344_8_0_3_2'
        ], async (path) => path.includes('BAOYU_~1')
            ? 'C:\\Users\\me\\Desktop\\BaoYu_1344_8_0_3_2'
            : path);
        assert.deepStrictEqual(paths, ['C:\\Users\\me\\Desktop\\BaoYu_1344_8_0_3_2']);
    });
    test('keeps the original path when realpath is unavailable', async () => {
        const paths = await normalizeWindowsTransferPaths([
            'C:\\Users\\me\\Desktop\\missing'
        ], async () => {
            throw new Error('not found');
        });
        assert.deepStrictEqual(paths, ['C:\\Users\\me\\Desktop\\missing']);
    });
    test('resolves very large Explorer selections concurrently with a fixed upper bound', async () => {
        const inputs = Array.from({ length: 100 }, (_, index) => `C:\\Data\\${String(index).padStart(3, '0')}.png`);
        let active = 0;
        let maximumActive = 0;
        const paths = await normalizeWindowsTransferPaths(inputs, async (path) => {
            active++;
            maximumActive = Math.max(maximumActive, active);
            await new Promise(resolve => setTimeout(resolve, 1));
            active--;
            return path;
        });
        assert.deepStrictEqual(paths, inputs);
        assert.strictEqual(maximumActive, 16);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHVyYm9maWxlV2luZG93c1BhdGgudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL0Q6L1dvcmsvQ29kZS9UdXJib0ZpbGUtV2luZG93cy9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS90dXJib2ZpbGUvdGVzdC9jb21tb24vdHVyYm9maWxlV2luZG93c1BhdGgudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEtBQUssTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUNqQyxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUVyRixLQUFLLENBQUMsc0JBQXNCLEVBQUUsR0FBRyxFQUFFO0lBQ2xDLElBQUksQ0FBQyxxRUFBcUUsRUFBRSxLQUFLLElBQUksRUFBRTtRQUN0RixNQUFNLEtBQUssR0FBRyxNQUFNLDZCQUE2QixDQUFDO1lBQ2pELGtDQUFrQztZQUNsQyw0Q0FBNEM7U0FDNUMsRUFBRSxLQUFLLEVBQUMsSUFBSSxFQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQztZQUN6QyxDQUFDLENBQUMsNENBQTRDO1lBQzlDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUVULE1BQU0sQ0FBQyxlQUFlLENBQUMsS0FBSyxFQUFFLENBQUMsNENBQTRDLENBQUMsQ0FBQyxDQUFDO0lBQy9FLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHNEQUFzRCxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ3ZFLE1BQU0sS0FBSyxHQUFHLE1BQU0sNkJBQTZCLENBQUM7WUFDakQsaUNBQWlDO1NBQ2pDLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDYixNQUFNLElBQUksS0FBSyxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQzlCLENBQUMsQ0FBQyxDQUFDO1FBRUgsTUFBTSxDQUFDLGVBQWUsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxpQ0FBaUMsQ0FBQyxDQUFDLENBQUM7SUFDcEUsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsK0VBQStFLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDaEcsTUFBTSxNQUFNLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sRUFBRSxHQUFHLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRSxLQUFLLEVBQUUsRUFBRSxDQUFDLGFBQWEsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQzVHLElBQUksTUFBTSxHQUFHLENBQUMsQ0FBQztRQUNmLElBQUksYUFBYSxHQUFHLENBQUMsQ0FBQztRQUN0QixNQUFNLEtBQUssR0FBRyxNQUFNLDZCQUE2QixDQUFDLE1BQU0sRUFBRSxLQUFLLEVBQUMsSUFBSSxFQUFDLEVBQUU7WUFDdEUsTUFBTSxFQUFFLENBQUM7WUFDVCxhQUFhLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxhQUFhLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDaEQsTUFBTSxJQUFJLE9BQU8sQ0FBTyxPQUFPLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUMzRCxNQUFNLEVBQUUsQ0FBQztZQUNULE9BQU8sSUFBSSxDQUFDO1FBQ2IsQ0FBQyxDQUFDLENBQUM7UUFFSCxNQUFNLENBQUMsZUFBZSxDQUFDLEtBQUssRUFBRSxNQUFNLENBQUMsQ0FBQztRQUN0QyxNQUFNLENBQUMsV0FBVyxDQUFDLGFBQWEsRUFBRSxFQUFFLENBQUMsQ0FBQztJQUN2QyxDQUFDLENBQUMsQ0FBQztBQUNKLENBQUMsQ0FBQyxDQUFDIn0=