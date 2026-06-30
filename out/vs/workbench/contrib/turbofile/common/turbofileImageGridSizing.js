/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Clamp the aspect ratio used for laying out a card. Without this, an extreme-aspect image (e.g. a
// 1024x32 crop) makes its card either freakishly wide — which inflates the grid's column width and
// leaves big gaps between every other card — or, fitted into the square preview, a ~4px sliver that
// looks like a stray dot. Clamping keeps the card a sane shape; the image itself fills it via CSS
// object-fit: cover, so a very wide/tall picture shows a centered crop instead of a sliver.
const MAX_GRID_CARD_ASPECT = 2.2;
export function getTurboFileImageGridCardSize(source, scale, baseCardWidth, basePreviewHeight, cardVerticalChrome, cardInlineChrome) {
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
        }
        else if (ratio < 1 / MAX_GRID_CARD_ASPECT) {
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
export function getTurboFileImageGridEffectiveColumns(maxColumns, availableWidth, cardWidth, gap) {
    const columns = Math.max(1, Math.round(maxColumns));
    const width = Math.max(1, Math.floor(availableWidth));
    const itemWidth = Math.max(1, Math.ceil(cardWidth));
    const itemGap = Math.max(0, Math.round(gap));
    return Math.max(1, Math.min(columns, Math.floor((width + itemGap) / (itemWidth + itemGap))));
}
function normalizePositiveNumber(value, fallback) {
    return Number.isFinite(value) && value !== undefined && value > 0 ? value : fallback;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHVyYm9maWxlSW1hZ2VHcmlkU2l6aW5nLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vRDovV29yay9Db2RlL1R1cmJvRmlsZS1XaW5kb3dzL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3R1cmJvZmlsZS9jb21tb24vdHVyYm9maWxlSW1hZ2VHcmlkU2l6aW5nLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBY2hHLG1HQUFtRztBQUNuRyxtR0FBbUc7QUFDbkcsb0dBQW9HO0FBQ3BHLGtHQUFrRztBQUNsRyw0RkFBNEY7QUFDNUYsTUFBTSxvQkFBb0IsR0FBRyxHQUFHLENBQUM7QUFFakMsTUFBTSxVQUFVLDZCQUE2QixDQUFDLE1BQXFDLEVBQUUsS0FBYSxFQUFFLGFBQXFCLEVBQUUsaUJBQXlCLEVBQUUsa0JBQTBCLEVBQUUsZ0JBQXdCO0lBQ3pNLE1BQU0sZUFBZSxHQUFHLHVCQUF1QixDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztJQUMxRCxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUM7SUFDekQsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsU0FBUyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDeEYsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUM7SUFDakUsTUFBTSxRQUFRLEdBQUcsdUJBQXVCLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxDQUFDLENBQUMsQ0FBQztJQUMxRCxNQUFNLFNBQVMsR0FBRyx1QkFBdUIsQ0FBQyxNQUFN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