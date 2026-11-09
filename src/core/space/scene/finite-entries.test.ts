import { describe, expect, it } from "vitest";
import { nodeId } from "../../base/ids/ids.js";
import { MisuseError } from "../../base/result.js";
import { createGeometryRegistry } from "../geometry/geometry-registry.js";
import { createCardGeometry } from "../geometry/presets/card-geometry.js";
import { rect } from "../geometry/spaces.js";
import { createAabbTree } from "../spatial-index/aabb-tree.js";
import { createBruteForceIndex } from "../spatial-index/brute-force-index.js";
import { createGeometryScene } from "./geometry-scene.js";
import { buildModel, twoPortNode } from "./scene-fixtures.js";

const everything = rect<"world">(-1e6, -1e6, 2e6, 2e6);

describe("non-finite bounds never reach the spatial index", () => {
  it("a geometry that returns NaN bounds for one node hides only that node", () => {
    const model = buildModel(
      [
        twoPortNode("a", 0, 0),
        twoPortNode("b", 200, 0, { type: "broken" }),
        twoPortNode("c", 400, 0),
      ],
      [["k", "a", "aR", "b", "bL"]],
    );
    const card = createCardGeometry();
    const registry = createGeometryRegistry();
    registry.register("broken", {
      ...card,
      paintedBounds: () => rect<"local">(Number.NaN, 0, 10, 10),
    });
    const scene = createGeometryScene(model, { registry });
    expect(scene.node(nodeId("b"))).toBeUndefined();
    const ids = scene.queryRect(everything).map((i) => i.id);
    expect(ids).toContain("a");
    expect(ids).toContain("c");
    expect(ids).not.toContain("b");
    const hit = scene.pick({ x: 400, y: 0 } as never, { zoom: 1 } as never);
    expect(hit.map((h) => (h.kind === "node" ? h.nodeId : ""))).toContain("c");
  });

  for (const [name, make] of [
    ["AABB tree", () => createAabbTree<string>()],
    ["brute-force index", () => createBruteForceIndex<string>()],
  ] as const) {
    it(`the ${name} refuses a non-finite box and keeps earlier entries`, () => {
      const index = make();
      index.insert("a", rect<"world">(0, 0, 10, 10));
      index.insert("b", rect<"world">(100, 0, 10, 10));
      for (const bad of [
        rect<"world">(Number.NaN, 0, 1, 1),
        rect<"world">(0, 0, Number.POSITIVE_INFINITY, 1),
      ]) {
        expect(() => index.insert("x", bad)).toThrow(MisuseError);
        expect(() => index.update("a", bad)).toThrow(MisuseError);
      }
      const out: string[] = [];
      index.queryRect(rect<"world">(-1, -1, 200, 20), out);
      expect(out.sort()).toEqual(["a", "b"]);
    });
  }
});
