function getTurboFileImageGridCardSize(source, scale, minPreviewSize, cardVerticalChrome, cardInlineChrome) {
  const normalizedScale = normalizePositiveNumber(scale, 1);
  const minSize = Math.max(1, Math.round(minPreviewSize));
  const sourceWidth = normalizePositiveNumber(source.width, 0);
  const sourceHeight = normalizePositiveNumber(source.height, 0);
  const hasSourceSize = sourceWidth > 0 && sourceHeight > 0;
  const imageWidth = hasSourceSize ? Math.max(1, Math.round(sourceWidth * normalizedScale)) : minSize;
  const imageHeight = hasSourceSize ? Math.max(1, Math.round(sourceHeight * normalizedScale)) : minSize;
  const previewWidth = Math.max(minSize, imageWidth);
  const previewHeight = Math.max(minSize, imageHeight);
  return {
    imageWidth,
    imageHeight,
    cardWidth: Math.max(1, Math.round(previewWidth + Math.max(0, cardInlineChrome))),
    rowHeight: Math.max(1, Math.round(previewHeight + Math.max(0, cardVerticalChrome) + Math.max(0, cardInlineChrome)))
  };
}
function getTurboFileImageGridEffectiveColumns(maxColumns, availableWidth, cardWidth, gap) {
  const columns = Math.max(1, Math.round(maxColumns));
  const width = Math.max(1, Math.floor(availableWidth));
  const itemWidth = Math.max(1, Math.ceil(cardWidth));
  const itemGap = Math.max(0, Math.round(gap));
  return Math.max(1, Math.min(columns, Math.floor((width + itemGap) / (itemWidth + itemGap))));
}
function normalizePositiveNumber(value, fallback) {
  return Number.isFinite(value) && value !== void 0 && value > 0 ? value : fallback;
}
export {
  getTurboFileImageGridCardSize,
  getTurboFileImageGridEffectiveColumns
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiRDpcXFdvcmtcXENvZGVcXFR1cmJvRmlsZS1XaW5kb3dzXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHR1cmJvZmlsZVxcY29tbW9uXFx0dXJib2ZpbGVJbWFnZUdyaWRTaXppbmcudHMiXSwKICAibWFwcGluZ3MiOiAiQUFpQk8sU0FBUyw4QkFBOEIsUUFBdUMsT0FBZSxnQkFBd0Isb0JBQTRCLGtCQUF1RDtBQUM5TSxRQUFNLGtCQUFrQix3QkFBd0IsT0FBTyxDQUFDO0FBQ3hELFFBQU0sVUFBVSxLQUFLLElBQUksR0FBRyxLQUFLLE1BQU0sY0FBYyxDQUFDO0FBQ3RELFFBQU0sY0FBYyx3QkFBd0IsT0FBTyxPQUFPLENBQUM7QUFDM0QsUUFBTSxlQUFlLHdCQUF3QixPQUFPLFFBQVEsQ0FBQztBQUM3RCxRQUFNLGdCQUFnQixjQUFjLEtBQUssZUFBZTtBQUN4RCxRQUFNLGFBQWEsZ0JBQWdCLEtBQUssSUFBSSxHQUFHLEtBQUssTUFBTSxjQUFjLGVBQWUsQ0FBQyxJQUFJO0FBQzVGLFFBQU0sY0FBYyxnQkFBZ0IsS0FBSyxJQUFJLEdBQUcsS0FBSyxNQUFNLGVBQWUsZUFBZSxDQUFDLElBQUk7QUFDOUYsUUFBTSxlQUFlLEtBQUssSUFBSSxTQUFTLFVBQVU7QUFDakQsUUFBTSxnQkFBZ0IsS0FBSyxJQUFJLFNBQVMsV0FBVztBQUNuRCxTQUFPO0FBQUEsSUFDTjtBQUFBLElBQ0E7QUFBQSxJQUNBLFdBQVcsS0FBSyxJQUFJLEdBQUcsS0FBSyxNQUFNLGVBQWUsS0FBSyxJQUFJLEdBQUcsZ0JBQWdCLENBQUMsQ0FBQztBQUFBLElBQy9FLFdBQVcsS0FBSyxJQUFJLEdBQUcsS0FBSyxNQUFNLGdCQUFnQixLQUFLLElBQUksR0FBRyxrQkFBa0IsSUFBSSxLQUFLLElBQUksR0FBRyxnQkFBZ0IsQ0FBQyxDQUFDO0FBQUEsRUFDbkg7QUFDRDtBQUVPLFNBQVMsc0NBQXNDLFlBQW9CLGdCQUF3QixXQUFtQixLQUFxQjtBQUN6SSxRQUFNLFVBQVUsS0FBSyxJQUFJLEdBQUcsS0FBSyxNQUFNLFVBQVUsQ0FBQztBQUNsRCxRQUFNLFFBQVEsS0FBSyxJQUFJLEdBQUcsS0FBSyxNQUFNLGNBQWMsQ0FBQztBQUNwRCxRQUFNLFlBQVksS0FBSyxJQUFJLEdBQUcsS0FBSyxLQUFLLFNBQVMsQ0FBQztBQUNsRCxRQUFNLFVBQVUsS0FBSyxJQUFJLEdBQUcsS0FBSyxNQUFNLEdBQUcsQ0FBQztBQUMzQyxTQUFPLEtBQUssSUFBSSxHQUFHLEtBQUssSUFBSSxTQUFTLEtBQUssT0FBTyxRQUFRLFlBQVksWUFBWSxRQUFRLENBQUMsQ0FBQztBQUM1RjtBQUVBLFNBQVMsd0JBQXdCLE9BQTJCLFVBQTBCO0FBQ3JGLFNBQU8sT0FBTyxTQUFTLEtBQUssS0FBSyxVQUFVLFVBQWEsUUFBUSxJQUFJLFFBQVE7QUFDN0U7IiwKICAibmFtZXMiOiBbXQp9Cg==
