import { describe, expect, it } from "vitest";
import { createIdAllocator } from "../../edit/commands/id-allocator.js";
import { allocateIds, placementDelta, remapRecords } from "./remap.js";
import { fragmentOf, make, makeModel, pairWithNeighbour } from "./test-kit.js";

describe("EDT-03 / MOD-03 ID remapping", () => {
  it("gives every node, port and connection a new ID and rewires endpoints", () => {
    const model = makeModel();
    const { a, b } = pairWithNeighbour(model);
    const snapshot = fragmentOf(model, [a.node, b.node]).fragment;
    const maps = allocateIds(
      snapshot,
      createIdAllocator(model.idGenerator, model.idCursor()),
    );
    const records = remapRecords(
      snapshot,
      [null, null],
      maps,
      { x: 0, y: 0 },
      5,
    );
    const existing = new Set<string>([
      ...model.reader.nodes().map((n) => n.id),
      ...model.reader.ports().map((p) => p.id),
      ...model.reader.connections().map((c) => c.id),
    ]);
    const fresh = [
      ...records.nodes.flatMap((n) => [n.node.id, ...n.node.ports]),
      ...records.connections.map((c) => c.id),
    ];
    expect(fresh).toHaveLength(2 + 4 + 1);
    for (const id of fresh) expect(existing.has(id)).toBe(false);
    const [c] = records.connections;
    const [na, nb] = records.nodes;
    expect(c?.from).toEqual({ node: na?.node.id, port: na?.node.ports[1] });
    expect(c?.to).toEqual({ node: nb?.node.id, port: nb?.node.ports[0] });
    for (const { node, ports } of records.nodes) {
      for (const p of ports) expect(p.node).toBe(node.id);
    }
    expect(records.nodes.map((n) => n.node.z)).toEqual([5, 6]);
  });

  it("never reuses an ID retired by a deletion", () => {
    const model = makeModel();
    const a = make(model, "pipe");
    const b = make(model, "pipe");
    const fragment = fragmentOf(model, [a.node]).fragment;
    model.execute({ kind: "deleteEntities", nodes: [b.node] });
    const maps = allocateIds(
      fragment,
      createIdAllocator(model.idGenerator, model.idCursor()),
    );
    const retired = [b.node, ...b.ports];
    expect(retired).not.toContain(maps.nodes.get(a.node));
    for (const p of a.ports) expect(retired).not.toContain(maps.ports.get(p));
  });
});

describe("EDT-03 placement transform", () => {
  it("centres the bounding box on `at` or offsets by `by`", () => {
    const model = makeModel();
    const { a, b } = pairWithNeighbour(model);
    const snapshot = fragmentOf(model, [a.node, b.node]).fragment;
    // Frames: a [-20,-10]..[20,10], b [80,30]..[120,50]; centre (50, 20).
    expect(
      placementDelta({ kind: "center", at: { x: 0, y: 0 } }, snapshot),
    ).toEqual({ x: -50, y: -20 });
    expect(
      placementDelta({ kind: "offset", by: { x: 20, y: 20 } }, snapshot),
    ).toEqual({ x: 20, y: 20 });
  });
});
