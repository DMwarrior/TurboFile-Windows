function shouldRetargetWindowsDesktopPane(currentPath, previousDesktopPath, profileDesktopPath) {
  return isSameWindowsPath(currentPath, previousDesktopPath) || isSameWindowsPath(currentPath, profileDesktopPath);
}
function isSameWindowsPath(left, right) {
  return getWindowsPathKey(left) === getWindowsPathKey(right);
}
function getWindowsPathKey(path) {
  return path.replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();
}
export {
  shouldRetargetWindowsDesktopPane
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiRDpcXFdvcmtcXENvZGVcXFR1cmJvRmlsZS1XaW5kb3dzXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHR1cmJvZmlsZVxcY29tbW9uXFx0dXJib2ZpbGVXaW5kb3dzTG9jYXRpb24udHMiXSwKICAibWFwcGluZ3MiOiAiQUFLTyxTQUFTLGlDQUFpQyxhQUFxQixxQkFBNkIsb0JBQXFDO0FBQ3ZJLFNBQU8sa0JBQWtCLGFBQWEsbUJBQW1CLEtBQUssa0JBQWtCLGFBQWEsa0JBQWtCO0FBQ2hIO0FBRUEsU0FBUyxrQkFBa0IsTUFBYyxPQUF3QjtBQUNoRSxTQUFPLGtCQUFrQixJQUFJLE1BQU0sa0JBQWtCLEtBQUs7QUFDM0Q7QUFFQSxTQUFTLGtCQUFrQixNQUFzQjtBQUNoRCxTQUFPLEtBQUssUUFBUSxPQUFPLElBQUksRUFBRSxRQUFRLFFBQVEsRUFBRSxFQUFFLFlBQVk7QUFDbEU7IiwKICAibmFtZXMiOiBbXQp9Cg==
