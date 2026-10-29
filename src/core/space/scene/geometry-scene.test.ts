import { describe, expect, it } from "vitest";
import { connectionId, nodeId } from "../../base/ids/ids.js";
import { createGraphModel } from "../../graph-model.js";
import { loadSnapshot } from "../../io/snapshot/load.js";
import { sampleSnapshot } from "../../io/snapshot/test-kit.js";
import { createGeometryRegistry } from "../geometry/geometry-registry.js";
import { createCardGeometry } from "../geometry/presets/card-geometry.js";
import { rect } from "../geometry/spaces.js";
import { createBruteForceIndex } from "../spatial-index/brute-force-index.js";
import type { SpatialIndex } from "../spatial-index/spatial-index.js";
import { createGeometryScene } from "./geometry-scene.js";
import { buildModel, graphOps, twoPortNode } from "./scene-fixtures.js";

const n = nodeId;
const c = connectionId;

/** Index wrapper that records which keys were written. */
function recordingIndex(): { index: SpatialIndex<string>; writes: string[] } {
  const inner = createBruteForceIndex<string>();
  const writes: string[] = [];
  const index: SpatialIndex<string> = {
    ...inner,
    insert: (k, b) => {
      writes.push(k);
      inner.insert(k, b);
    },
    update: (k, b) => {
      writes.push(k);
      inner.update(k, b);
    },
    remove: (k) => {
      writes.push(k);
      inner.remove(k);
    },
    queryRect: (r, out) => inner.queryRect(r, out),
    queryPoint: (p, r, out) => inner.queryPoint(p, r, out),
    get size() {
      return inner.size;
    },
    clear: () => inner.clear(),
  };
  return { index, writes };
}

function chain() {
  return buildModel(
    [0, 1, 2, 3, 4].map((i) => twoPortNode(`n${i}`, i * 200, 0)),
    [0, 1, 2, 3].map(
      (i) => [`c${i}`, `n${i}`, `n${i}R`, `n${i + 1}`, `n${i + 1}L`] as const,
    ),
  );
}

describe("IDX-02 incremental updates", () => {
  it("IDX-02 drag one node: only the moved node and its incident connections change", () => {
    const model = chain();
    const rec = recordingIndex();
    const scene = createGeometryScene(model, { index: rec.index });
    const before = scene.stats();
    rec.writes.length = 0;
    const untouchedNode = scene.node(n("n0"));
    const untouchedConn = scene.connection(c("c0"));
    const movedBefore = scene.node(n("n2"));

    expect(
      model.moveNodes([{ node: n("n2"), position: { x: 400, y: 90 } }]).status,
    ).toBe("accepted");

    const after = scene.stats();
    expect(after.nodeRebuilds - before.nodeRebuilds).toBe(1);
    expect(after.connectionRebuilds - before.connectionRebuilds).toBe(2);
    expect([...rec.writes].sort()).toEqual(["c:c1", "c:c2", "n:n2"]);
    expect(scene.node(n("n0"))).toBe(untouchedNode);
    expect(scene.connection(c("c0"))).toBe(untouchedConn);
    expect(scene.node(n("n2"))).not.toBe(movedBefore);
    expect(scene.node(n("n2"))?.bodyBounds.y).toBe(80);
    // The incident paths now end at the moved anchors.
    const path = scene.connection(c("c1"))?.path;
    expect(path?.kind === "cubic" && path.p1).toEqual({ x: 380, y: 90 });
  });

  it("IDX-02 z-order and other record-only changes do not recompute geometry", () => {
    const model = chain();
    const scene = createGeometryScene(model);
    const before = scene.stats();
    model.submit({
      ops: [
        {
          op: "update",
          entity: "node",
          id: n("n1"),
          fields: { z: { old: 0, new: 5 }, title: { new: "named" } },
        },
      ],
    });
    expect(scene.stats()).toEqual(before);
    expect(scene.node(n("n1"))?.record.z).toBe(5);
  });

  it("IDX-02 incremental result equals a from-scratch projection after edits and undo", () => {
    const model = chain();
    const scene = createGeometryScene(model);
    model.rotateNodes([n("n1"), n("n3")], 1);
    model.mirrorNodes([n("n2")]);
    model.deleteEntities({ nodes: [n("n4")] });
    model.moveNodes([{ node: n("n0"), position: { x: -50, y: 50 } }]);
    model.undo();
    model.undo();
    model.redo();
    const fresh = createGeometryScene(model);
    for (const node of model.reader.nodes()) {
      expect(scene.node(node.id)).toEqual(fresh.node(node.id));
    }
    for (const conn of model.reader.connections()) {
      expect(scene.connection(conn.id)).toEqual(fresh.connection(conn.id));
    }
    expect(scene.node(n("n4"))).toBeUndefined();
    const all = rect<"world">(-1e4, -1e4, 2e4, 2e4);
    expect(scene.queryRect(all)).toEqual(fresh.queryRect(all));
  });

  it("IDX-02 add and remove touch only their own entries; reset rebuilds everything", () => {
    const model = createGraphModel();
    const scene = createGeometryScene(model);
    model.submit({
      ops: graphOps([twoPortNode("a", 0, 0), twoPortNode("b", 200, 0)]),
    });
    expect(scene.node(n("a"))).toBeDefined();
    const s1 = scene.stats();
    model.submit({
      ops: graphOps([], [["c1", "a", "aR", "b", "bL"]]),
    });
    const s2 = scene.stats();
    expect(s2.nodeRebuilds).toBe(s1.nodeRebuilds);
    expect(s2.connectionRebuilds - s1.connectionRebuilds).toBe(1);
    const loaded = loadSnapshot(model, sampleSnapshot());
    expect(loaded.ok).toBe(true);
    expect(scene.node(n("a"))).toBeUndefined();
    expect(scene.node(n("n1"))).toBeDefined();
    expect(scene.connection(c("c1"))?.record.id).toBe("c1");
    scene.dispose();
    model.moveNodes([{ node: n("n1"), position: { x: 7, y: 7 } }]);
    expect(scene.node(n("n1"))?.record.position).not.toEqual({ x: 7, y: 7 });
  });

  it("IDX-02 a geometry registration change rebuilds only nodes of that type", () => {
    const model = buildModel([
      twoPortNode("a", 0, 0, { type: "card" }),
      twoPortNode("b", 200, 0, { type: "other" }),
      twoPortNode("c", 400, 0, { type: "card" }),
    ]);
    const registry = createGeometryRegistry();
    const scene = createGeometryScene(model, { registry });
    const before = scene.stats();
    const bBefore = scene.node(n("b"));
    registry.register("card", createCardGeometry({ labelMargin: 30 }));
    expect(scene.stats().nodeRebuilds - before.nodeRebuilds).toBe(2);
    expect(scene.node(n("b"))).toBe(bBefore);
    expect(scene.node(n("a"))?.paintedBounds.w).toBe(40 + 60);
  });
});

describe("IDX-03 culling by painted bounds", () => {
  it("IDX-03 label extends into viewport: body off-screen, painted bounds visible", () => {
    const model = buildModel([{ id: "a", x: 100, y: 10, w: 40, h: 20 }]);
    const registry = createGeometryRegistry();
    registry.register("t", createCardGeometry({ labelMargin: 50 }));
    const scene = createGeometryScene(model, { registry });
    const viewport = rect<"world">(0, 0, 60, 60);
    // Body spans x 80..120; painted spans x 30..170.
    expect(scene.node(n("a"))?.bodyBounds.x).toBe(80);
    expect(scene.queryRect(viewport)).toEqual([{ kind: "node", id: "a" }]);
    expect(scene.queryRect(viewport, "hit")).toEqual([]);
    expect(scene.queryRect(rect(0, 0, 20, 20))).toEqual([]);
  });

  it("GEO-04 path with off-screen endpoints is culled in and hit by its visible segment", () => {
    const model = buildModel(
      [twoPortNode("a", -2000, 0), twoPortNode("b", 2000, 0)],
      [["c1", "a", "aR", "b", "bL"]],
    );
    const scene = createGeometryScene(model, { routeMode: () => "straight" });
    const viewport = rect<"world">(-50, -50, 100, 100);
    expect(scene.queryRect(viewport)).toEqual([
      { kind: "connection", id: "c1" },
    ]);
    const hits = scene.pick({ x: 0, y: 2 }, { zoom: 1 });
    expect(hits).toEqual([{ kind: "connection", connectionId: "c1" }]);
  });

  it("IDX-03 results come back in paint order: connections, then nodes by (z, seq)", () => {
    const model = buildModel(
      [
        twoPortNode("a", 0, 0, { z: 2 }),
        twoPortNode("b", 10, 0, { z: 1 }),
        twoPortNode("c", 20, 0, { z: 1 }),
      ],
      [["c1", "a", "aR", "b", "bL"]],
    );
    const scene = createGeometryScene(model);
    const order = scene
      .queryRect(rect(-100, -100, 400, 400))
      .map((i) => `${i.kind}:${i.id}`);
    expect(order).toEqual(["connection:c1", "node:b", "node:c", "node:a"]);
    expect(order.filter((x) => x.startsWith("node"))).toEqual(
      model.reader.paintOrder().map((nr) => `node:${nr.id}`),
    );
    const flipped = createGeometryScene(model, {
      layerOrder: ["node", "connection", "port"],
    });
    expect(flipped.queryRect(rect(-100, -100, 400, 400))[3]).toEqual({
      kind: "connection",
      id: "c1",
    });
  });
});

describe("IDX-01 swappable index", () => {
  it("IDX-01 alternative implementation: brute force gives identical culling and picking", () => {
    const model = chain();
    const tree = createGeometryScene(model);
    const brute = createGeometryScene(model, {
      index: createBruteForceIndex<string>(),
    });
    for (let x = -100; x < 1000; x += 37) {
      const area = rect<"world">(x, -60, 150, 120);
      expect(tree.queryRect(area)).toEqual(brute.queryRect(area));
      for (const zoom of [0.5, 1, 4]) {
        expect(tree.pick({ x, y: 3 }, { zoom })).toEqual(
          brute.pick({ x, y: 3 }, { zoom }),
        );
      }
    }
  });
});

describe("NOD-07 placeholder geometry in the scene", () => {
  it("NOD-07 / GEO-02b an unregistered type and a portless node are paintable and pickable", () => {
    const model = buildModel([
      { id: "solo", x: 0, y: 0, type: "never-registered" },
    ]);
    const scene = createGeometryScene(model);
    expect(scene.queryRect(rect(-5, -5, 10, 10))).toEqual([
      { kind: "node", id: "solo" },
    ]);
    expect(scene.pick({ x: 1, y: 1 }, { zoom: 1 })).toEqual([
      { kind: "node", nodeId: "solo" },
    ]);
    expect(scene.node(n("solo"))?.anchors).toEqual([]);
  });
});
