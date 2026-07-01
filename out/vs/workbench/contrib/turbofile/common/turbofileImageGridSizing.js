const MAX_GRID_CARD_ASPECT = 2.2;
function getTurboFileImageGridCardSize(source, scale, baseCardWidth, basePreviewHeight, cardVerticalChrome, cardInlineChrome) {
  const normalizedScale = normalizePositiveNumber(scale, 1);
  const baseWidth = Math.max(1, Math.round(baseCardWidth));
  const previewWidth = Math.max(1, baseWidth - Math.max(0, Math.round(cardInlineChrome)));
  const previewHeight = Math.max(1, Math.round(basePreviewHeight));
  const rawWidth = normalizePositiveNumber(source.width, 0);
  const rawHeight = normalizePositiveNumber(source.height, 0);
  const hasSourceSize = rawWidth > 0 && rawHeight > 0;
  let sourceWidth = rawWidth;
  let sourceHeight = rawHeight;
  if (hasSourceSize) {
    const ratio = rawWidth / rawHeight;
    if (ratio > MAX_GRID_CARD_ASPECT) {
      sourceHeight = rawWidth / MAX_GRID_CARD_ASPECT;
    } else if (ratio < 1 / MAX_GRID_CARD_ASPECT) {
      sourceWidth = rawHeight / MAX_GRID_CARD_ASPECT;
    }
  }
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiRDpcXFdvcmtcXENvZGVcXFR1cmJvRmlsZS1XaW5kb3dzXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHR1cmJvZmlsZVxcY29tbW9uXFx0dXJib2ZpbGVJbWFnZUdyaWRTaXppbmcudHMiXSwKICAibWFwcGluZ3MiOiAiQUFzQkEsTUFBTSx1QkFBdUI7QUFFdEIsU0FBUyw4QkFBOEIsUUFBdUMsT0FBZSxlQUF1QixtQkFBMkIsb0JBQTRCLGtCQUF1RDtBQUN4TyxRQUFNLGtCQUFrQix3QkFBd0IsT0FBTyxDQUFDO0FBQ3hELFFBQU0sWUFBWSxLQUFLLElBQUksR0FBRyxLQUFLLE1BQU0sYUFBYSxDQUFDO0FBQ3ZELFFBQU0sZUFBZSxLQUFLLElBQUksR0FBRyxZQUFZLEtBQUssSUFBSSxHQUFHLEtBQUssTUFBTSxnQkFBZ0IsQ0FBQyxDQUFDO0FBQ3RGLFFBQU0sZ0JBQWdCLEtBQUssSUFBSSxHQUFHLEtBQUssTUFBTSxpQkFBaUIsQ0FBQztBQUMvRCxRQUFNLFdBQVcsd0JBQXdCLE9BQU8sT0FBTyxDQUFDO0FBQ3hELFFBQU0sWUFBWSx3QkFBd0IsT0FBTyxRQUFRLENBQUM7QUFDMUQsUUFBTSxnQkFBZ0IsV0FBVyxLQUFLLFlBQVk7QUFDbEQsTUFBSSxjQUFjO0FBQ2xCLE1BQUksZUFBZTtBQUNuQixNQUFJLGVBQWU7QUFDbEIsVUFBTSxRQUFRLFdBQVc7QUFDekIsUUFBSSxRQUFRLHNCQUFzQjtBQUNqQyxxQkFBZSxXQUFXO0FBQUEsSUFDM0IsV0FBVyxRQUFRLElBQUksc0JBQXNCO0FBQzVDLG9CQUFjLFlBQVk7QUFBQSxJQUMzQjtBQUFBLEVBQ0Q7QUFDQSxRQUFNLGlCQUFpQixnQkFBZ0IsS0FBSyxJQUFJLGVBQWUsYUFBYSxnQkFBZ0IsY0FBYyxDQUFDLElBQUk7QUFDL0csUUFBTSxpQkFBaUIsZ0JBQWdCLEtBQUssSUFBSSxHQUFHLEtBQUssTUFBTSxjQUFjLGNBQWMsQ0FBQyxJQUFJO0FBQy9GLFFBQU0sa0JBQWtCLGdCQUFnQixLQUFLLElBQUksR0FBRyxLQUFLLE1BQU0sZUFBZSxjQUFjLENBQUMsSUFBSTtBQUNqRyxRQUFNLGFBQWEsS0FBSyxJQUFJLEdBQUcsS0FBSyxNQUFNLGlCQUFpQixlQUFlLENBQUM7QUFDM0UsUUFBTSxjQUFjLEtBQUssSUFBSSxHQUFHLEtBQUssTUFBTSxrQkFBa0IsZUFBZSxDQUFDO0FBQzdFLFNBQU87QUFBQSxJQUNOO0FBQUEsSUFDQTtBQUFBLElBQ0EsV0FBVyxLQUFLLElBQUksV0FBVyxLQUFLLE1BQU0sYUFBYSxLQUFLLElBQUksR0FBRyxnQkFBZ0IsQ0FBQyxDQUFDO0FBQUEsSUFDckYsV0FBVyxLQUFLLElBQUksR0FBRyxLQUFLLE1BQU0sS0FBSyxJQUFJLGVBQWUsV0FBVyxJQUFJLEtBQUssSUFBSSxHQUFHLGtCQUFrQixDQUFDLENBQUM7QUFBQSxFQUMxRztBQUNEO0FBRU8sU0FBUyxzQ0FBc0MsWUFBb0IsZ0JBQXdCLFdBQW1CLEtBQXFCO0FBQ3pJLFFBQU0sVUFBVSxLQUFLLElBQUksR0FBRyxLQUFLLE1BQU0sVUFBVSxDQUFDO0FBQ2xELFFBQU0sUUFBUSxLQUFLLElBQUksR0FBRyxLQUFLLE1BQU0sY0FBYyxDQUFDO0FBQ3BELFFBQU0sWUFBWSxLQUFLLElBQUksR0FBRyxLQUFLLEtBQUssU0FBUyxDQUFDO0FBQ2xELFFBQU0sVUFBVSxLQUFLLElBQUksR0FBRyxLQUFLLE1BQU0sR0FBRyxDQUFDO0FBQzNDLFNBQU8sS0FBSyxJQUFJLEdBQUcsS0FBSyxJQUFJLFNBQVMsS0FBSyxPQUFPLFFBQVEsWUFBWSxZQUFZLFFBQVEsQ0FBQyxDQUFDO0FBQzVGO0FBRUEsU0FBUyx3QkFBd0IsT0FBMkIsVUFBMEI7QUFDckYsU0FBTyxPQUFPLFNBQVMsS0FBSyxLQUFLLFVBQVUsVUFBYSxRQUFRLElBQUksUUFBUTtBQUM3RTsiLAogICJuYW1lcyI6IFtdCn0K
