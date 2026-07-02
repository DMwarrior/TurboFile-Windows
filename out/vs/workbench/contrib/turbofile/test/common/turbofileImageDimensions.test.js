/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { formatTurboFileImageDimensions } from '../../common/turbofileImageDimensions.js';
suite('TurboFileImageDimensions', () => {
    test('prefers original dimensions over transformed preview dimensions', () => {
        assert.strictEqual(formatTurboFileImageDimensions({
            width: 1920,
            height: 360,
            originalWidth: 2048,
            originalHeight: 384
        }), '2048 × 384');
    });
    test('falls back to transformed dimensions when original dimensions are absent', () => {
        assert.strictEqual(formatTurboFileImageDimensions({
            width: 1920,
            height: 360
        }), '1920 × 360');
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHVyYm9maWxlSW1hZ2VEaW1lbnNpb25zLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9EOi9Xb3JrL0NvZGUvVHVyYm9GaWxlLVdpbmRvd3Mvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdHVyYm9maWxlL3Rlc3QvY29tbW9uL3R1cmJvZmlsZUltYWdlRGltZW5zaW9ucy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQ2pDLE9BQU8sRUFBRSw4QkFBOEIsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBRTFGLEtBQUssQ0FBQywwQkFBMEIsRUFBRSxHQUFHLEVBQUU7SUFDdEMsSUFBSSxDQUFDLGlFQUFpRSxFQUFFLEdBQUcsRUFBRTtRQUM1RSxNQUFNLENBQUMsV0FBVyxDQUFDLDhCQUE4QixDQUFDO1lBQ2pELEtBQUssRUFBRSxJQUFJO1lBQ1gsTUFBTSxFQUFFLEdBQUc7WUFDWCxhQUFhLEVBQUUsSUFBSTtZQUNuQixjQUFjLEVBQUUsR0FBRztTQUNuQixDQUFDLEVBQUUsWUFBWSxDQUFDLENBQUM7SUFDbkIsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsMEVBQTBFLEVBQUUsR0FBRyxFQUFFO1FBQ3JGLE1BQU0sQ0FBQyxXQUFXLENBQUMsOEJBQThCLENBQUM7WUFDakQsS0FBSyxFQUFFLElBQUk7WUFDWCxNQUFNLEVBQUUsR0FBRztTQUNYLENBQUMsRUFBRSxZQUFZLENBQUMsQ0FBQztJQUNuQixDQUFDLENBQUMsQ0FBQztBQUNKLENBQUMsQ0FBQyxDQUFDIn0=