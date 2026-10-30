import {
  createAabbTree,
  createGeometryScene,
  type Rect,
  type SpatialIndex,
} from "nodeeditor-js";
import { describe, expect, it } from "vitest";
import { F_LARGE } from "../fixtures/fixture-specs.js";
import { createFixtureGeometry } from "../fixtures/fixture-types.js";
import { loadFixture } from "./setup.js";

/** Index wrapper that records the key of every write. */
function countingIndex() {
  const inner = createAabbTree<string>();
  const writes: string[] = [];
  const index: SpatialIndex<string> = {
    insert(key, bounds: Rect<"world">) {
      writes.push(key);
      inner.insert(key, bounds);
    },
    update(key, bounds: Rect<"world">) {
      writes.push(key);
      inner.update(key, bounds);
    },
    remove(key) {
      writes.push(key);
      inner.remove(key);
    },
    queryRect: (r, out) => inner.queryRect(r, out),
    queryPoint: (p, radius, out) => inner.queryPoint(p, radius, out),
    get size() {
      return inner.size;
    },
    clear: () => inner.clear(),
  };
  return { index, writes };
}

describe("PERF-04, IDX-02 incremental index updates in F-LARGE", () => {
  it("moving one node updates only it and its incident connections", () => {
    const { model } = loadFixture(F_LARGE);
    const { index, writes } = countingIndex();
    const scene = createGeometryScene(model, {
      registry: createFixtureGeometry(),
      index,
    });
    expect(index.size).toBe(F_LARGE.nodes + F_LARGE.connections);
    const node = model.reader
      .nodes()
      .find((n) => model.reader.connectionsOfNode(n.id).length >= 2);
    if (!node) throw new Error("fixture has no connected node");
    const incident = model.reader.connectionsOfNode(node.id).map((c) => c.id);
    writes.length = 0;
    const before = scene.stats();

    const result = model.submit(
      {
        ops: [
          {
            op: "update",
            entity: "node",
            id: node.id,
            fields: {
              position: {
                old: node.position,
                new: { x: node.position.x + 10, y: node.position.y },
              },
            },
          },
        ],
      },
      { history: "skip" },
    );
    expect(result.status).toBe("accepted");

    const expected = [`n:${node.id}`, ...incident.map((c) => `c:${c}`)].sort();
    expect([...new Set(writes)].sort()).toEqual(expected);
    expect(writes.length).toBe(expected.length);
    const after = scene.stats();
    expect(after.nodeRebuilds - before.nodeRebuilds).toBe(1);
    expect(after.connectionRebuilds - before.connectionRebuilds).toBe(
      incident.length,
    );
    scene.dispose();
  });
});
