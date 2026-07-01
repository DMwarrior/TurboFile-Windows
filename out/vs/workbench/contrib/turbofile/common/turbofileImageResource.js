/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export const TURBOFILE_IMAGE_GRID_RESOURCE_QUALITY = 72;
export const TURBOFILE_IMAGE_PREVIEW_RESOURCE_QUALITY = 82;
export const TURBOFILE_IMAGE_PREVIEW_MAX_BYTES = 128 * 1024 * 1024;
/**
 * Sources larger than this read as the true original for the preview. Above it, the original is
 * almost always a high-megapixel image (e.g. super-resolution PNGs) that the renderer's <img>
 * decoder refuses to rasterize ("Failed to load image"), so it is downscaled to a display bound
 * instead. The shrink-only geometry means smaller images keep their native size.
 */
export const TURBOFILE_IMAGE_PREVIEW_ORIGINAL_MAX_BYTES = 12 * 1024 * 1024;
export function createTurboFileImageGridResourceOptions(width, sourceSize, sourceModified) {
    return {
        width,
        quality: TURBOFILE_IMAGE_GRID_RESOURCE_QUALITY,
        // JPEG, not WebP: some servers' ImageMagick WebP delegate produced byte streams that passed a
        // shallow magic-byte check but that this build's Chromium <img> decoder rejected for certain
        // sources, leaving grid cards on the generic file icon. JPEG decodes universally and is
        // verifiable in the main process before it is served.
        format: 'jpeg',
        interpolation: 'lanczos',
        sourceSize,
        sourceModified
    };
}
export function createTurboFileImagePreviewResourceOptions(isWindowsSsh, request, sourceSize, sourceModified) {
    // Read the true original only when it is small enough to be both transferred quickly and
    // rasterized by the renderer. Windows SSH and very large sources are downscaled to a display
    // bound so the preview always loads regardless of source dimensions.
    const mustDownscale = isWindowsSsh || (Number.isFinite(sourceSize) && sourceSize > TURBOFILE_IMAGE_PREVIEW_ORIGINAL_MAX_BYTES);
    if (!mustDownscale) {
        return {
            forceOriginal: true,
            maxBytes: TURBOFILE_IMAGE_PREVIEW_MAX_BYTES,
            sourceSize,
            sourceModified
        };
    }
    return {
        width: request.width,
        height: request.height,
        quality: request.quality,
        format: 'jpeg',
        interpolation: 'lanczos',
        maxBytes: TURBOFILE_IMAGE_PREVIEW_MAX_BYTES,
        sourceSize,
        sourceModified
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHVyYm9maWxlSW1hZ2VSZXNvdXJjZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL0Q6L1dvcmsvQ29kZS9UdXJib0ZpbGUtV2luZG93cy9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90dXJib2ZpbGUvY29tbW9uL3R1cmJvZmlsZUltYWdlUmVzb3VyY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFJaEcsTUFBTSxDQUFDLE1BQU0scUNBQXFDLEdBQUcsRUFBRSxDQUFDO0FBQ3hELE1BQU0sQ0FBQyxNQUFNLHdDQUF3QyxHQUFHLEVBQUUsQ0FBQztBQUMzRCxNQUFNLENBQUMsTUFBTSxpQ0FBaUMsR0FBRyxHQUFHLEdBQUcsSUFBSSxHQUFHLElBQUksQ0FBQztBQUVuRTs7Ozs7R0FLRztBQUNILE1BQU0sQ0FBQyxNQUFNLDBDQUEwQyxHQUFHLEVBQUUsR0FBRyxJQUFJLEdBQUcsSUFBSSxDQUFDO0FBUTNFLE1BQU0sVUFBVSx1Q0FBdUMsQ0FBQyxLQUFhLEVBQUUsVUFBa0IsRUFBRSxjQUFzQjtJQUNoSCxPQUFPO1FBQ04sS0FBSztRQUNMLE9BQU8sRUFBRSxxQ0FBcUM7UUFDOUMsOEZBQThGO1FBQzlGLDZGQUE2RjtRQUM3Rix3RkFBd0Y7UUFDeEYsc0RBQXNEO1FBQ3RELE1BQU0sRUFBRSxNQUFNO1FBQ2QsYUFBYSxFQUFFLFNBQVM7UUFDeEIsVUFBVTtRQUNWLGNBQWM7S0FDZCxDQUFDO0FBQ0gsQ0FBQztBQUVELE1BQU0sVUFBVSwwQ0FBMEMsQ0FBQyxZQUFxQixFQUFFLE9BQTJDLEVBQUUsVUFBa0IsRUFBRSxjQUFzQjtJQUN4Syx5RkFBeUY7SUFDekYsNkZBQTZGO0lBQzdGLHFFQUFxRTtJQUNyRSxNQUFNLGFBQWEsR0FBRyxZQUFZLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxJQUFJLFVBQVUsR0FBRywwQ0FBMEMsQ0FBQyxDQUFDO0lBQy9ILElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztRQUNwQixPQUFPO1lBQ04sYUFBYSxFQUFFLElBQUk7WUFDbkIsUUFBUSxFQUFFLGlDQUFpQztZQUMzQyxVQUFVO1lBQ1YsY0FBYztTQUNkLENBQUM7SUFDSCxDQUFDO0lBRUQsT0FBTztRQUNOLEtBQUssRUFBRSxPQUFPLENBQUMsS0FBSztRQUNwQixNQUFNLEVBQUUsT0FBTyxDQUFDLE1BQU07UUFDdEIsT0FBTyxFQUFFLE9BQU8sQ0FBQyxPQUFPO1FBQ3hCLE1BQU0sRUFBRSxNQUFNO1FBQ2QsYUFBYSxFQUFFLFNBQVM7UUFDeEIsUUFBUSxFQUFFLGlDQUFpQztRQUMzQyxVQUFVO1FBQ1YsY0FBYztLQUNkLENBQUM7QUFDSCxDQUFDIn0=