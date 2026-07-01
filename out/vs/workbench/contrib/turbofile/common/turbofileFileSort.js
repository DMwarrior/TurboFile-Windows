/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export function sortTurboFileItems(items, key, direction) {
    return [...items].sort((left, right) => compareTurboFileItems(left, right, key, direction));
}
function compareTurboFileItems(left, right, key, direction) {
    if (!!left.parent !== !!right.parent) {
        return left.parent ? -1 : 1;
    }
    if (!!left.directory !== !!right.directory) {
        return left.directory ? -1 : 1;
    }
    const comparison = compareTurboFileItemsByKey(left, right, key);
    const directed = direction === 'descending' ? -comparison : comparison;
    return directed || compareNames(left.name, right.name);
}
function compareTurboFileItemsByKey(left, right, key) {
    switch (key) {
        case 'modified':
            return compareNumbers(left.rawModified, right.rawModified);
        case 'size':
            return compareNumbers(left.rawSize, right.rawSize);
        case 'type':
            return compareNames(getTypeSortKey(left), getTypeSortKey(right));
        case 'name':
        default:
            return compareNames(left.name, right.name);
    }
}
function compareNumbers(left, right) {
    return (left || 0) - (right || 0);
}
function compareNames(left, right) {
    return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
}
function getTypeSortKey(item) {
    if (item.directory) {
        return 'directory';
    }
    const dotIndex = item.name.lastIndexOf('.');
    return dotIndex >= 0 && dotIndex < item.name.length - 1 ? item.name.substring(dotIndex + 1).toLowerCase() : item.type;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHVyYm9maWxlRmlsZVNvcnQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9EOi9Xb3JrL0NvZGUvVHVyYm9GaWxlLVdpbmRvd3Mvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdHVyYm9maWxlL2NvbW1vbi90dXJib2ZpbGVGaWxlU29ydC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQWdCaEcsTUFBTSxVQUFVLGtCQUFrQixDQUFrQyxLQUFtQixFQUFFLEdBQXFCLEVBQUUsU0FBaUM7SUFDaEosT0FBTyxDQUFDLEdBQUcsS0FBSyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRSxFQUFFLENBQUMscUJBQXFCLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsU0FBUyxDQUFDLENBQUMsQ0FBQztBQUM3RixDQUFDO0FBRUQsU0FBUyxxQkFBcUIsQ0FBQyxJQUEyQixFQUFFLEtBQTRCLEVBQUUsR0FBcUIsRUFBRSxTQUFpQztJQUNqSixJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxLQUFLLENBQUMsQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUM7UUFDdEMsT0FBTyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzdCLENBQUM7SUFDRCxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsU0FBUyxLQUFLLENBQUMsQ0FBQyxLQUFLLENBQUMsU0FBUyxFQUFFLENBQUM7UUFDNUMsT0FBTyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ2hDLENBQUM7SUFFRCxNQUFNLFVBQVUsR0FBRywwQkFBMEIsQ0FBQyxJQUFJLEVBQUUsS0FBSyxFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBQ2hFLE1BQU0sUUFBUSxHQUFHLFNBQVMsS0FBSyxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUM7SUFDdkUsT0FBTyxRQUFRLElBQUksWUFBWSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQ3hELENBQUM7QUFFRCxTQUFTLDBCQUEwQixDQUFDLElBQTJCLEVBQUUsS0FBNEIsRUFBRSxHQUFxQjtJQUNuSCxRQUFRLEdBQUcsRUFBRSxDQUFDO1FBQ2IsS0FBSyxVQUFVO1lBQ2QsT0FBTyxjQUFjLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxLQUFLLENBQUMsV0FBVyxDQUFDLENBQUM7UUFDNUQsS0FBSyxNQUFNO1lBQ1YsT0FBTyxjQUFjLENBQUMsSUFBSSxDQUFDLE9BQU8sRUFBRSxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDcEQsS0FBSyxNQUFNO1lBQ1YsT0FBTyxZQUFZLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxFQUFFLGNBQWMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1FBQ2xFLEtBQUssTUFBTSxDQUFDO1FBQ1o7WUFDQyxPQUFPLFlBQVksQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUM3QyxDQUFDO0FBQ0YsQ0FBQztBQUVELFNBQVMsY0FBYyxDQUFDLElBQVksRUFBRSxLQUFhO0lBQ2xELE9BQU8sQ0FBQyxJQUFJLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxLQUFLLElBQUksQ0FBQyxDQUFDLENBQUM7QUFDbkMsQ0FBQztBQUVELFNBQVMsWUFBWSxDQUFDLElBQVksRUFBRSxLQUFhO0lBQ2hELE9BQU8sSUFBSSxDQUFDLGFBQWEsQ0FBQyxLQUFLLEVBQUUsU0FBUyxFQUFFLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxXQUFXLEVBQUUsTUFBTSxFQUFFLENBQUMsQ0FBQztBQUNyRixDQUFDO0FBRUQsU0FBUyxjQUFjLENBQUMsSUFBMkI7SUFDbEQsSUFBSSxJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7UUFDcEIsT0FBTyxXQUFXLENBQUM7SUFDcEIsQ0FBQztJQUNELE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQzVDLE9BQU8sUUFBUSxJQUFJLENBQUMsSUFBSSxRQUFRLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxRQUFRLEdBQUcsQ0FBQyxDQUFDLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUM7QUFDdkgsQ0FBQyJ9