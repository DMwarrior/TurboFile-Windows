function createTurboFileImagePreviewReadOptions(sourceSize, sourceModified) {
  return {
    encoding: "base64",
    forceOriginal: true,
    maxBytes: 128 * 1024 * 1024,
    sourceSize,
    sourceModified
  };
}
export {
  createTurboFileImagePreviewReadOptions
};
