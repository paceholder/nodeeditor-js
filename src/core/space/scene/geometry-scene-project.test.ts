import { describe, expect, it } from "vitest";
import { nodeId } from "../../base/ids/ids.js";
import { createGraphModel } from "../../graph-model.js";
import { createGeometryScene } from "./geometry-scene.js";
import { graphOps, twoPortNode } from "./scene-fixtures.js";

const n = nodeId;

/** Two connected nodes; a host policy allows resizing the fixture type. */
function model() {
  const m = createGraphModel({ capabilityPolicy: { decide: () => true } });
  m.submit({
    ops: graphOps(
      [twoPortNode("a", 0, 0), twoPortNode("b", 200, 0, { rotation: 1 })],
      [["c1", "a", "aR", "b", "bL"]],
    ),
  });
  return m;
}

describe("NOD-04a, NOD-08 scene projection for previews", () => {
  it("projects the entry the scene builds after committing the same update", () => {
    const m = model();
    const scene = createGeometryScene(m);
    const change = {
      position: { x: 210, y: 15 },
      size: { width: 60, height: 50 },
      mirrored: true,
    };
    const before = scene.stats();
    const projected = scene.project(n("b"), change);
    expect(scene.stats()).toEqual(before);
    // The cached entry is untouched by the projection.
    expect(scene.node(n("b"))?.record.size).toEqual({ width: 40, height: 20 });

    const current = m.reader.getNode(n("b"));
    if (!current) throw new Error("no node");
    m.submit({
      ops: [
        {
          op: "update",
          entity: "node",
          id: n("b"),
          fields: {
            position: { old: current.position, new: change.position },
            size: { old: current.size, new: change.size },
            mirrored: { old: false, new: true },
          },
        },
      ],
    });
    expect(projected).toEqual(scene.node(n("b")));
    expect(projected?.anchors.length).toBe(2);
  });

  it("returns undefined for an unknown node", () => {
    const scene = createGeometryScene(model());
    expect(scene.project(n("zzz"), { size: { width: 1, height: 1 } })).toBe(
      undefined,
    );
  });
});
