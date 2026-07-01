async function normalizeWindowsTransferPaths(paths, resolvePath) {
  const result = [];
  const seen = /* @__PURE__ */ new Set();
  for (const rawPath of paths) {
    const candidate = normalizeWindowsTransferPath(rawPath);
    if (!candidate) {
      continue;
    }
    const resolved = normalizeWindowsTransferPath(await resolvePath(candidate).catch(() => candidate)) ?? candidate;
    const key = getWindowsTransferPathKey(resolved);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(resolved);
  }
  return result;
}
function getWindowsTransferPathKey(path) {
  return path.replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();
}
function normalizeWindowsTransferPath(path) {
  const trimmed = path.trim().replace(/^"|"$/g, "").replace(/^file:\/\/\/?/i, "");
  return trimmed || void 0;
}
export {
  getWindowsTransferPathKey,
  normalizeWindowsTransferPaths
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiRDpcXFdvcmtcXENvZGVcXFR1cmJvRmlsZS1XaW5kb3dzXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdHVyYm9maWxlXFxjb21tb25cXHR1cmJvZmlsZVdpbmRvd3NQYXRoLnRzIl0sCiAgIm1hcHBpbmdzIjogIkFBT0EsZUFBc0IsOEJBQThCLE9BQTBCLGFBQXFEO0FBQ2xJLFFBQU0sU0FBbUIsQ0FBQztBQUMxQixRQUFNLE9BQU8sb0JBQUksSUFBWTtBQUU3QixhQUFXLFdBQVcsT0FBTztBQUM1QixVQUFNLFlBQVksNkJBQTZCLE9BQU87QUFDdEQsUUFBSSxDQUFDLFdBQVc7QUFDZjtBQUFBLElBQ0Q7QUFFQSxVQUFNLFdBQVcsNkJBQTZCLE1BQU0sWUFBWSxTQUFTLEVBQUUsTUFBTSxNQUFNLFNBQVMsQ0FBQyxLQUFLO0FBQ3RHLFVBQU0sTUFBTSwwQkFBMEIsUUFBUTtBQUM5QyxRQUFJLEtBQUssSUFBSSxHQUFHLEdBQUc7QUFDbEI7QUFBQSxJQUNEO0FBRUEsU0FBSyxJQUFJLEdBQUc7QUFDWixXQUFPLEtBQUssUUFBUTtBQUFBLEVBQ3JCO0FBRUEsU0FBTztBQUNSO0FBRU8sU0FBUywwQkFBMEIsTUFBc0I7QUFDL0QsU0FBTyxLQUFLLFFBQVEsT0FBTyxJQUFJLEVBQUUsUUFBUSxRQUFRLEVBQUUsRUFBRSxZQUFZO0FBQ2xFO0FBRUEsU0FBUyw2QkFBNkIsTUFBa0M7QUFDdkUsUUFBTSxVQUFVLEtBQUssS0FBSyxFQUFFLFFBQVEsVUFBVSxFQUFFLEVBQUUsUUFBUSxrQkFBa0IsRUFBRTtBQUM5RSxTQUFPLFdBQVc7QUFDbkI7IiwKICAibmFtZXMiOiBbXQp9Cg==
