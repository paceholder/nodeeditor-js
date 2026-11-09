import { describe, expect, it } from "vitest";
import { nodeId } from "../../base/ids/ids.js";
import { createGeometryRegistry } from "../geometry/geometry-registry.js";
import type { NodeGeometry, NodeView } from "../geometry/node-geometry.js";
import { rect } from "../geometry/spaces.js";
import { createGeometryScene } from "./geometry-scene.js";
import { buildModel } from "./scene-fixtures.js";

/** A host geometry that sizes the node from its title: 10 units per character. */
function titled(dependsOn?: NodeGeometry["dependsOn"]): NodeGeometry {
  const box = (view: NodeView) => {
    const w = 10 * (view.node.title ?? "").length;
    return rect<"local">(-w / 2, -5, w, 10);
  };
  return {
    bodyBounds: box,
    hitShape: (view) => ({ kind: "rect", bounds: box(view) }),
    paintedBounds: box,
    anchors: () => [],
    ...(dependsOn ? { dependsOn } : {}),
  };
}

const retitle = (model: ReturnType<typeof buildModel>, title: string) =>
  model.submit({
    ops: [
      {
        op: "update",
        entity: "node",
        id: nodeId("a"),
        fields: { title: { old: "ab", new: title } },
      },
    ],
  });

function setup(geometry: NodeGeometry) {
  const model = buildModel([]);
  model.submit({
    ops: [
      {
        op: "add",
        entity: "node",
        record: {
          id: nodeId("a"),
          type: "label",
          position: { x: 0, y: 0 },
          size: { width: 0, height: 0 },
          rotation: 0,
          mirrored: false,
          z: 0,
          ports: [],
          title: "ab",
          payload: null,
        },
      },
    ],
  });
  const registry = createGeometryRegistry();
  registry.register("label", geometry);
  return { model, scene: createGeometryScene(model, { registry }) };
}

describe("geometry may declare content dependencies", () => {
  it("a geometry that declares title follows a title change", () => {
    const { model, scene } = setup(titled(["title"]));
    expect(scene.node(nodeId("a"))?.bodyBounds.w).toBe(20);
    retitle(model, "abcdef");
    expect(scene.node(nodeId("a"))?.bodyBounds.w).toBe(60);
  });

  it("an undeclared content change does not rebuild the geometry", () => {
    const { model, scene } = setup(titled());
    const before = scene.stats().nodeRebuilds;
    retitle(model, "abcdef");
    expect(scene.stats().nodeRebuilds).toBe(before);
    expect(scene.node(nodeId("a"))?.record.title).toBe("abcdef");
  });
});
