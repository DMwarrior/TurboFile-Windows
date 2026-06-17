function getTurboFileImageGridCardSize(source, scale, baseCardWidth, basePreviewHeight, cardVerticalChrome, cardInlineChrome) {
  const normalizedScale = normalizePositiveNumber(scale, 1);
  const baseWidth = Math.max(1, Math.round(baseCardWidth));
  const previewWidth = Math.max(1, baseWidth - Math.max(0, Math.round(cardInlineChrome)));
  const previewHeight = Math.max(1, Math.round(basePreviewHeight));
  const sourceWidth = normalizePositiveNumber(source.width, 0);
  const sourceHeight = normalizePositiveNumber(source.height, 0);
  const hasSourceSize = sourceWidth > 0 && sourceHeight > 0;
  const baseImageScale = hasSourceSize ? Math.min(previewWidth / sourceWidth, previewHeight / sourceHeight, 1) : 1;
  const baseImageWidth = hasSourceSize ? Math.max(1, Math.round(sourceWidth * baseImageScale)) : previewWidth;
  const baseImageHeight = hasSourceSize ? Math.max(1, Math.round(sourceHeight * baseImageScale)) : previewHeight;
  const imageWidth = Math.max(1, Math.round(baseImageWidth * normalizedScale));
  const imageHeight = Math.max(1, Math.round(baseImageHeight * normalizedScale));
  return {
    imageWidth,
    imageHeight,
    cardWidth: Math.max(baseWidth, Math.round(imageWidth + Math.max(0, cardInlineChrome))),
    rowHeight: Math.max(1, Math.round(Math.max(previewHeight, imageHeight) + Math.max(0, cardVerticalChrome)))
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiRDpcXFdvcmtcXENvZGVcXFR1cmJvRmlsZS1XaW5kb3dzXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHR1cmJvZmlsZVxcY29tbW9uXFx0dXJib2ZpbGVJbWFnZUdyaWRTaXppbmcudHMiXSwKICAibWFwcGluZ3MiOiAiQUFpQk8sU0FBUyw4QkFBOEIsUUFBdUMsT0FBZSxlQUF1QixtQkFBMkIsb0JBQTRCLGtCQUF1RDtBQUN4TyxRQUFNLGtCQUFrQix3QkFBd0IsT0FBTyxDQUFDO0FBQ3hELFFBQU0sWUFBWSxLQUFLLElBQUksR0FBRyxLQUFLLE1BQU0sYUFBYSxDQUFDO0FBQ3ZELFFBQU0sZUFBZSxLQUFLLElBQUksR0FBRyxZQUFZLEtBQUssSUFBSSxHQUFHLEtBQUssTUFBTSxnQkFBZ0IsQ0FBQyxDQUFDO0FBQ3RGLFFBQU0sZ0JBQWdCLEtBQUssSUFBSSxHQUFHLEtBQUssTUFBTSxpQkFBaUIsQ0FBQztBQUMvRCxRQUFNLGNBQWMsd0JBQXdCLE9BQU8sT0FBTyxDQUFDO0FBQzNELFFBQU0sZUFBZSx3QkFBd0IsT0FBTyxRQUFRLENBQUM7QUFDN0QsUUFBTSxnQkFBZ0IsY0FBYyxLQUFLLGVBQWU7QUFDeEQsUUFBTSxpQkFBaUIsZ0JBQWdCLEtBQUssSUFBSSxlQUFlLGFBQWEsZ0JBQWdCLGNBQWMsQ0FBQyxJQUFJO0FBQy9HLFFBQU0saUJBQWlCLGdCQUFnQixLQUFLLElBQUksR0FBRyxLQUFLLE1BQU0sY0FBYyxjQUFjLENBQUMsSUFBSTtBQUMvRixRQUFNLGtCQUFrQixnQkFBZ0IsS0FBSyxJQUFJLEdBQUcsS0FBSyxNQUFNLGVBQWUsY0FBYyxDQUFDLElBQUk7QUFDakcsUUFBTSxhQUFhLEtBQUssSUFBSSxHQUFHLEtBQUssTUFBTSxpQkFBaUIsZUFBZSxDQUFDO0FBQzNFLFFBQU0sY0FBYyxLQUFLLElBQUksR0FBRyxLQUFLLE1BQU0sa0JBQWtCLGVBQWUsQ0FBQztBQUM3RSxTQUFPO0FBQUEsSUFDTjtBQUFBLElBQ0E7QUFBQSxJQUNBLFdBQVcsS0FBSyxJQUFJLFdBQVcsS0FBSyxNQUFNLGFBQWEsS0FBSyxJQUFJLEdBQUcsZ0JBQWdCLENBQUMsQ0FBQztBQUFBLElBQ3JGLFdBQVcsS0FBSyxJQUFJLEdBQUcsS0FBSyxNQUFNLEtBQUssSUFBSSxlQUFlLFdBQVcsSUFBSSxLQUFLLElBQUksR0FBRyxrQkFBa0IsQ0FBQyxDQUFDO0FBQUEsRUFDMUc7QUFDRDtBQUVPLFNBQVMsc0NBQXNDLFlBQW9CLGdCQUF3QixXQUFtQixLQUFxQjtBQUN6SSxRQUFNLFVBQVUsS0FBSyxJQUFJLEdBQUcsS0FBSyxNQUFNLFVBQVUsQ0FBQztBQUNsRCxRQUFNLFFBQVEsS0FBSyxJQUFJLEdBQUcsS0FBSyxNQUFNLGNBQWMsQ0FBQztBQUNwRCxRQUFNLFlBQVksS0FBSyxJQUFJLEdBQUcsS0FBSyxLQUFLLFNBQVMsQ0FBQztBQUNsRCxRQUFNLFVBQVUsS0FBSyxJQUFJLEdBQUcsS0FBSyxNQUFNLEdBQUcsQ0FBQztBQUMzQyxTQUFPLEtBQUssSUFBSSxHQUFHLEtBQUssSUFBSSxTQUFTLEtBQUssT0FBTyxRQUFRLFlBQVksWUFBWSxRQUFRLENBQUMsQ0FBQztBQUM1RjtBQUVBLFNBQVMsd0JBQXdCLE9BQTJCLFVBQTBCO0FBQ3JGLFNBQU8sT0FBTyxTQUFTLEtBQUssS0FBSyxVQUFVLFVBQWEsUUFBUSxJQUFJLFFBQVE7QUFDN0U7IiwKICAibmFtZXMiOiBbXQp9Cg==
