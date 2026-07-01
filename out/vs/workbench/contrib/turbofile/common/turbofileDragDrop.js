function getTurboFileRowDragEffectAllowed() {
  return "copyMove";
}
function shouldHandleTurboFilePaneDropAtPage(sourceSide, targetSide) {
  return sourceSide === void 0 || sourceSide !== targetSide;
}
function getTurboFileDirectoryMoveRefreshPaths(sourceDir, targetDir) {
  return sourceDir === targetDir ? [sourceDir] : [sourceDir, targetDir];
}
export {
  getTurboFileDirectoryMoveRefreshPaths,
  getTurboFileRowDragEffectAllowed,
  shouldHandleTurboFilePaneDropAtPage
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiRDpcXFdvcmtcXENvZGVcXFR1cmJvRmlsZS1XaW5kb3dzXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHR1cmJvZmlsZVxcY29tbW9uXFx0dXJib2ZpbGVEcmFnRHJvcC50cyJdLAogICJtYXBwaW5ncyI6ICJBQU9PLFNBQVMsbUNBQStDO0FBQzlELFNBQU87QUFDUjtBQUVPLFNBQVMsb0NBQW9DLFlBQTJDLFlBQXdDO0FBQ3RJLFNBQU8sZUFBZSxVQUFhLGVBQWU7QUFDbkQ7QUFFTyxTQUFTLHNDQUFzQyxXQUFtQixXQUE2QjtBQUNyRyxTQUFPLGNBQWMsWUFBWSxDQUFDLFNBQVMsSUFBSSxDQUFDLFdBQVcsU0FBUztBQUNyRTsiLAogICJuYW1lcyI6IFtdCn0K
