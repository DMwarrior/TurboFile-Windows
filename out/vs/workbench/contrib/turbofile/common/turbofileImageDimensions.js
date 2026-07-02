/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export function getTurboFileImageDimensions(image) {
    const originalWidth = toPositiveInteger(image.originalWidth);
    const originalHeight = toPositiveInteger(image.originalHeight);
    if (originalWidth !== undefined && originalHeight !== undefined) {
        return { width: originalWidth, height: originalHeight };
    }
    const width = toPositiveInteger(image.width);
    const height = toPositiveInteger(image.height);
    if (width !== undefined && height !== undefined) {
        return { width, height };
    }
    return undefined;
}
export function formatTurboFileImageDimensions(image, separator = ' × ') {
    const dimensions = getTurboFileImageDimensions(image);
    return dimensions ? `${dimensions.width}${separator}${dimensions.height}` : '';
}
function toPositiveInteger(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        return undefined;
    }
    return Math.max(1, Math.round(value));
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHVyYm9maWxlSW1hZ2VEaW1lbnNpb25zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vRDovV29yay9Db2RlL1R1cmJvRmlsZS1XaW5kb3dzL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3R1cmJvZmlsZS9jb21tb24vdHVyYm9maWxlSW1hZ2VEaW1lbnNpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBU2hHLE1BQU0sVUFBVSwyQkFBMkIsQ0FBQyxLQUFnQztJQUMzRSxNQUFNLGFBQWEsR0FBRyxpQkFBaUIsQ0FBQyxLQUFLLENBQUMsYUFBYSxDQUFDLENBQUM7SUFDN0QsTUFBTSxjQUFjLEdBQUcsaUJBQWlCLENBQUMsS0FBSyxDQUFDLGNBQWMsQ0FBQyxDQUFDO0lBQy9ELElBQUksYUFBYSxLQUFLLFNBQVMsSUFBSSxjQUFjLEtBQUssU0FBUyxFQUFFLENBQUM7UUFDakUsT0FBTyxFQUFFLEtBQUssRUFBRSxhQUFhLEVBQUUsTUFBTSxFQUFFLGNBQWMsRUFBRSxDQUFDO0lBQ3pELENBQUM7SUFFRCxNQUFNLEtBQUssR0FBRyxpQkFBaUIsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDN0MsTUFBTSxNQUFNLEdBQUcsaUJBQWlCLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQy9DLElBQUksS0FBSyxLQUFLLFNBQVMsSUFBSSxNQUFNLEtBQUssU0FBUyxFQUFFLENBQUM7UUFDakQsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsQ0FBQztJQUMxQixDQUFDO0lBRUQsT0FBTyxTQUFTLENBQUM7QUFDbEIsQ0FBQztBQUVELE1BQU0sVUFBVSw4QkFBOEIsQ0FBQyxLQUFnQyxFQUFFLFNBQVMsR0FBRyxLQUFLO0lBQ2pHLE1BQU0sVUFBVSxHQUFHLDJCQUEyQixDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ3RELE9BQU8sVUFBVSxDQUFDLENBQUMsQ0FBQyxHQUFHLFVBQVUsQ0FBQyxLQUFLLEdBQUcsU0FBUyxHQUFHLFVBQVUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO0FBQ2hGLENBQUM7QUFFRCxTQUFTLGlCQUFpQixDQUFDLEtBQXlCO0lBQ25ELElBQUksT0FBTyxLQUFLLEtBQUssUUFBUSxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsSUFBSSxLQUFLLElBQUksQ0FBQyxFQUFFLENBQUM7UUFDeEUsT0FBTyxTQUFTLENBQUM7SUFDbEIsQ0FBQztJQUNELE9BQU8sSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO0FBQ3ZDLENBQUMifQ==