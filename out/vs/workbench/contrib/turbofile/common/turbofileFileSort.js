function sortTurboFileItems(items, key, direction) {
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
  const directed = direction === "descending" ? -comparison : comparison;
  return directed || compareNames(left.name, right.name);
}
function compareTurboFileItemsByKey(left, right, key) {
  switch (key) {
    case "modified":
      return compareNumbers(left.rawModified, right.rawModified);
    case "size":
      return compareNumbers(left.rawSize, right.rawSize);
    case "type":
      return compareNames(getTypeSortKey(left), getTypeSortKey(right));
    case "name":
    default:
      return compareNames(left.name, right.name);
  }
}
function compareNumbers(left, right) {
  return (left || 0) - (right || 0);
}
function compareNames(left, right) {
  return left.localeCompare(right, void 0, { numeric: true, sensitivity: "base" });
}
function getTypeSortKey(item) {
  if (item.directory) {
    return "directory";
  }
  const dotIndex = item.name.lastIndexOf(".");
  return dotIndex >= 0 && dotIndex < item.name.length - 1 ? item.name.substring(dotIndex + 1).toLowerCase() : item.type;
}
export {
  sortTurboFileItems
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiRDpcXFdvcmtcXENvZGVcXFR1cmJvRmlsZS1XaW5kb3dzXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHR1cmJvZmlsZVxcY29tbW9uXFx0dXJib2ZpbGVGaWxlU29ydC50cyJdLAogICJtYXBwaW5ncyI6ICJBQW1CTyxTQUFTLG1CQUFvRCxPQUFxQixLQUF1QixXQUF3QztBQUN2SixTQUFPLENBQUMsR0FBRyxLQUFLLEVBQUUsS0FBSyxDQUFDLE1BQU0sVUFBVSxzQkFBc0IsTUFBTSxPQUFPLEtBQUssU0FBUyxDQUFDO0FBQzNGO0FBRUEsU0FBUyxzQkFBc0IsTUFBNkIsT0FBOEIsS0FBdUIsV0FBMkM7QUFDM0osTUFBSSxDQUFDLENBQUMsS0FBSyxXQUFXLENBQUMsQ0FBQyxNQUFNLFFBQVE7QUFDckMsV0FBTyxLQUFLLFNBQVMsS0FBSztBQUFBLEVBQzNCO0FBQ0EsTUFBSSxDQUFDLENBQUMsS0FBSyxjQUFjLENBQUMsQ0FBQyxNQUFNLFdBQVc7QUFDM0MsV0FBTyxLQUFLLFlBQVksS0FBSztBQUFBLEVBQzlCO0FBRUEsUUFBTSxhQUFhLDJCQUEyQixNQUFNLE9BQU8sR0FBRztBQUM5RCxRQUFNLFdBQVcsY0FBYyxlQUFlLENBQUMsYUFBYTtBQUM1RCxTQUFPLFlBQVksYUFBYSxLQUFLLE1BQU0sTUFBTSxJQUFJO0FBQ3REO0FBRUEsU0FBUywyQkFBMkIsTUFBNkIsT0FBOEIsS0FBK0I7QUFDN0gsVUFBUSxLQUFLO0FBQUEsSUFDWixLQUFLO0FBQ0osYUFBTyxlQUFlLEtBQUssYUFBYSxNQUFNLFdBQVc7QUFBQSxJQUMxRCxLQUFLO0FBQ0osYUFBTyxlQUFlLEtBQUssU0FBUyxNQUFNLE9BQU87QUFBQSxJQUNsRCxLQUFLO0FBQ0osYUFBTyxhQUFhLGVBQWUsSUFBSSxHQUFHLGVBQWUsS0FBSyxDQUFDO0FBQUEsSUFDaEUsS0FBSztBQUFBLElBQ0w7QUFDQyxhQUFPLGFBQWEsS0FBSyxNQUFNLE1BQU0sSUFBSTtBQUFBLEVBQzNDO0FBQ0Q7QUFFQSxTQUFTLGVBQWUsTUFBYyxPQUF1QjtBQUM1RCxVQUFRLFFBQVEsTUFBTSxTQUFTO0FBQ2hDO0FBRUEsU0FBUyxhQUFhLE1BQWMsT0FBdUI7QUFDMUQsU0FBTyxLQUFLLGNBQWMsT0FBTyxRQUFXLEVBQUUsU0FBUyxNQUFNLGFBQWEsT0FBTyxDQUFDO0FBQ25GO0FBRUEsU0FBUyxlQUFlLE1BQXFDO0FBQzVELE1BQUksS0FBSyxXQUFXO0FBQ25CLFdBQU87QUFBQSxFQUNSO0FBQ0EsUUFBTSxXQUFXLEtBQUssS0FBSyxZQUFZLEdBQUc7QUFDMUMsU0FBTyxZQUFZLEtBQUssV0FBVyxLQUFLLEtBQUssU0FBUyxJQUFJLEtBQUssS0FBSyxVQUFVLFdBQVcsQ0FBQyxFQUFFLFlBQVksSUFBSSxLQUFLO0FBQ2xIOyIsCiAgIm5hbWVzIjogW10KfQo=
