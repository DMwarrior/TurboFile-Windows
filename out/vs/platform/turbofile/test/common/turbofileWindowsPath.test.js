import * as assert from "assert";
import { normalizeWindowsTransferPaths } from "../../common/turbofileWindowsPath.js";
suite("TurboFileWindowsPath", () => {
  test("deduplicates Windows short and long names after realpath resolution", async () => {
    const paths = await normalizeWindowsTransferPaths([
      "C:\\Users\\me\\Desktop\\BAOYU_~1",
      "C:\\Users\\me\\Desktop\\BaoYu_1344_8_0_3_2"
    ], async (path) => path.includes("BAOYU_~1") ? "C:\\Users\\me\\Desktop\\BaoYu_1344_8_0_3_2" : path);
    assert.deepStrictEqual(paths, ["C:\\Users\\me\\Desktop\\BaoYu_1344_8_0_3_2"]);
  });
  test("keeps the original path when realpath is unavailable", async () => {
    const paths = await normalizeWindowsTransferPaths([
      "C:\\Users\\me\\Desktop\\missing"
    ], async () => {
      throw new Error("not found");
    });
    assert.deepStrictEqual(paths, ["C:\\Users\\me\\Desktop\\missing"]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiRDpcXFdvcmtcXENvZGVcXFR1cmJvRmlsZS1XaW5kb3dzXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdHVyYm9maWxlXFx0ZXN0XFxjb21tb25cXHR1cmJvZmlsZVdpbmRvd3NQYXRoLnRlc3QudHMiXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLFlBQVk7QUFDeEIsU0FBUyxxQ0FBcUM7QUFFOUMsTUFBTSx3QkFBd0IsTUFBTTtBQUNuQyxPQUFLLHVFQUF1RSxZQUFZO0FBQ3ZGLFVBQU0sUUFBUSxNQUFNLDhCQUE4QjtBQUFBLE1BQ2pEO0FBQUEsTUFDQTtBQUFBLElBQ0QsR0FBRyxPQUFNLFNBQVEsS0FBSyxTQUFTLFVBQVUsSUFDdEMsK0NBQ0EsSUFBSTtBQUVQLFdBQU8sZ0JBQWdCLE9BQU8sQ0FBQyw0Q0FBNEMsQ0FBQztBQUFBLEVBQzdFLENBQUM7QUFFRCxPQUFLLHdEQUF3RCxZQUFZO0FBQ3hFLFVBQU0sUUFBUSxNQUFNLDhCQUE4QjtBQUFBLE1BQ2pEO0FBQUEsSUFDRCxHQUFHLFlBQVk7QUFDZCxZQUFNLElBQUksTUFBTSxXQUFXO0FBQUEsSUFDNUIsQ0FBQztBQUVELFdBQU8sZ0JBQWdCLE9BQU8sQ0FBQyxpQ0FBaUMsQ0FBQztBQUFBLEVBQ2xFLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
