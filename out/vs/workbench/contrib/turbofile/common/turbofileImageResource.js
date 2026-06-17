const TURBOFILE_IMAGE_GRID_RESOURCE_QUALITY = 72;
const TURBOFILE_IMAGE_PREVIEW_RESOURCE_QUALITY = 82;
const TURBOFILE_IMAGE_PREVIEW_MAX_BYTES = 128 * 1024 * 1024;
const TURBOFILE_IMAGE_PREVIEW_ORIGINAL_MAX_BYTES = 12 * 1024 * 1024;
function createTurboFileImageGridResourceOptions(width, sourceSize, sourceModified) {
  return {
    width,
    quality: TURBOFILE_IMAGE_GRID_RESOURCE_QUALITY,
    // JPEG, not WebP: some servers' ImageMagick WebP delegate produced byte streams that passed a
    // shallow magic-byte check but that this build's Chromium <img> decoder rejected for certain
    // sources, leaving grid cards on the generic file icon. JPEG decodes universally and is
    // verifiable in the main process before it is served.
    format: "jpeg",
    interpolation: "lanczos",
    sourceSize,
    sourceModified
  };
}
function createTurboFileImagePreviewResourceOptions(isWindowsSsh, request, sourceSize, sourceModified) {
  const mustDownscale = isWindowsSsh || Number.isFinite(sourceSize) && sourceSize > TURBOFILE_IMAGE_PREVIEW_ORIGINAL_MAX_BYTES;
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
    format: "jpeg",
    interpolation: "lanczos",
    maxBytes: TURBOFILE_IMAGE_PREVIEW_MAX_BYTES,
    sourceSize,
    sourceModified
  };
}
export {
  TURBOFILE_IMAGE_GRID_RESOURCE_QUALITY,
  TURBOFILE_IMAGE_PREVIEW_MAX_BYTES,
  TURBOFILE_IMAGE_PREVIEW_ORIGINAL_MAX_BYTES,
  TURBOFILE_IMAGE_PREVIEW_RESOURCE_QUALITY,
  createTurboFileImageGridResourceOptions,
  createTurboFileImagePreviewResourceOptions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiRDpcXFdvcmtcXENvZGVcXFR1cmJvRmlsZS1XaW5kb3dzXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHR1cmJvZmlsZVxcY29tbW9uXFx0dXJib2ZpbGVJbWFnZVJlc291cmNlLnRzIl0sCiAgIm1hcHBpbmdzIjogIkFBT08sTUFBTSx3Q0FBd0M7QUFDOUMsTUFBTSwyQ0FBMkM7QUFDakQsTUFBTSxvQ0FBb0MsTUFBTSxPQUFPO0FBUXZELE1BQU0sNkNBQTZDLEtBQUssT0FBTztBQVEvRCxTQUFTLHdDQUF3QyxPQUFlLFlBQW9CLGdCQUF3RDtBQUNsSixTQUFPO0FBQUEsSUFDTjtBQUFBLElBQ0EsU0FBUztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsSUFLVCxRQUFRO0FBQUEsSUFDUixlQUFlO0FBQUEsSUFDZjtBQUFBLElBQ0E7QUFBQSxFQUNEO0FBQ0Q7QUFFTyxTQUFTLDJDQUEyQyxjQUF1QixTQUE2QyxZQUFvQixnQkFBd0Q7QUFJMU0sUUFBTSxnQkFBZ0IsZ0JBQWlCLE9BQU8sU0FBUyxVQUFVLEtBQUssYUFBYTtBQUNuRixNQUFJLENBQUMsZUFBZTtBQUNuQixXQUFPO0FBQUEsTUFDTixlQUFlO0FBQUEsTUFDZixVQUFVO0FBQUEsTUFDVjtBQUFBLE1BQ0E7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUVBLFNBQU87QUFBQSxJQUNOLE9BQU8sUUFBUTtBQUFBLElBQ2YsUUFBUSxRQUFRO0FBQUEsSUFDaEIsU0FBUyxRQUFRO0FBQUEsSUFDakIsUUFBUTtBQUFBLElBQ1IsZUFBZTtBQUFBLElBQ2YsVUFBVTtBQUFBLElBQ1Y7QUFBQSxJQUNBO0FBQUEsRUFDRDtBQUNEOyIsCiAgIm5hbWVzIjogW10KfQo=
