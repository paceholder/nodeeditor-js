import { describe, expect, it } from "vitest";
import * as core from "../../index.js";

describe("geometry exports", () => {
  it("exposes the geometry, spatial-index and scene APIs from the core entry", () => {
    const model = core.createGraphModel();
    const scene: core.GeometryScene = core.createGeometryScene(model);
    expect(scene.pick({ x: 0, y: 0 }, { zoom: 1 })).toEqual([]);
    expect(core.createAabbTree<string>().size).toBe(0);
    expect(core.MAX_WORLD_COORD).toBe(1e7);
    expect(
      core.nodeTransform({
        position: { x: 1, y: 2 },
        rotation: 0,
        mirrored: false,
      }).e,
    ).toBe(1);
  });
});
