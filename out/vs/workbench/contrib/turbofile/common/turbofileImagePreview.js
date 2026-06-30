/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * Sources at or below this size are previewed as the true original bytes — fast enough to stream
 * and keeps pixel-exact fidelity for the inspector/histogram.
 */
export const TURBOFILE_PREVIEW_ORIGINAL_MAX_BYTES = 8 * 1024 * 1024;
/**
 * Upper bound (px) for the long edge of a downscaled preview of a very large source. Shrink-only,
 * so anything already within the bound is returned untouched; only oversized images are reduced.
 * 4096 keeps the preview crisp at any normal display/zoom while making the payload small.
 */
export const TURBOFILE_PREVIEW_LARGE_MAX_DIMENSION = 4096;
/**
 * Builds the read options for the full-size image preview.
 *
 * Small/medium sources read at original size (forceOriginal) for pixel-exact fidelity. Very large
 * sources (e.g. 4K+ dense PNGs) are downscaled remotely to a display-resolution bound instead:
 * transferring tens of MB of original bytes over IPC was slow and intermittently failed ("No
 * response from server"), while a remote ImageMagick downscale returns in a fraction of the time
 * and stays visually identical at normal zoom. The shrink-only geometry means this never enlarges.
 */
export function createTurboFileImagePreviewReadOptions(sourceSize, sourceModified) {
    if (Number.isFinite(sourceSize) && sourceSize > TURBOFILE_PREVIEW_ORIGINAL_MAX_BYTES) {
        return {
            encoding: 'base64',
            width: TURBOFILE_PREVIEW_LARGE_MAX_DIMENSION,
            height: TURBOFILE_PREVIEW_LARGE_MAX_DIMENSION,
            quality: 92,
            format: 'webp',
            interpolation: 'lanczos',
            maxBytes: 256 * 1024 * 1024,
            sourceSize,
            sourceModified
        };
    }
    return {
        encoding: 'base64',
        forceOriginal: true,
        maxBytes: 128 * 1024 * 1024,
        sourceSize,
        sourceModified
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHVyYm9maWxlSW1hZ2VQcmV2aWV3LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vRDovV29yay9Db2RlL1R1cmJvRmlsZS1XaW5kb3dzL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3R1cmJvZmlsZS9jb21tb24vdHVyYm9maWxlSW1hZ2VQcmV2aWV3LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBSWhHOzs7R0FHRztBQUNILE1BQU0sQ0FBQyxNQUFNLG9DQUFvQyxHQUFHLENBQUMsR0FBRyxJQUFJLEdBQUcsSUFBSSxDQUFDO0FBRXBFOzs7O0dBSUc7QUFDSCxNQUFNLENBQUMsTUFBTSxxQ0FBcUMsR0FBRyxJQUFJLENBQUM7QUFFMUQ7Ozs7Ozs7O0dBUUc7QUFDSCxNQUFNLFVBQVUsc0NBQXNDLENBQUMsVUFBa0IsRUFBRSxjQUFzQjtJQUNoRyxJQUFJLE1BQU0sQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLElBQUksVUFBVSxHQUFHLG9DQUFvQyxFQUFFLENBQUM7UUFDdEYsT0FBTztZQUNOLFFBQVEsRUFBRSxRQUFRO1lBQ2xCLEtBQUssRUFBRSxxQ0FBcUM7WUFDNUMsTUFBTSxFQUFFLHFDQUFxQztZQUM3QyxPQUFPLEVBQUUsRUFBRTtZQUNYLE1BQU0sRUFBRSxNQUFNO1lBQ2QsYUFBYSxFQUFFLFNBQVM7WUFDeEIsUUFBUSxFQUFFLEdBQUcsR0FBRyxJQUFJLEdBQUcsSUFBSTtZQUMzQixVQUFVO1lBQ1YsY0FBYztTQUNkLENBQUM7SUFDSCxDQUFDO0lBQ0QsT0FBTztRQUNOLFFBQVEsRUFBRSxRQUFRO1FBQ2xCLGFBQWEsRUFBRSxJQUFJO1FBQ25CLFFBQVEsRUFBRSxHQUFHLEdBQUcsSUFBSSxHQUFHLElBQUk7UUFDM0IsVUFBVTtRQUNWLGNBQWM7S0FDZCxDQUFDO0FBQ0gsQ0FBQyJ9