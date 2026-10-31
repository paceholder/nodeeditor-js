import { describe, expect, it } from "vitest";
import { frameVector } from "../../data/model/node-frame.js";
import type { NodeRecord } from "../../data/model/records.js";
import type { GraphModelOptions } from "../../graph-model.js";
import { make, makeModel } from "./test-kit.js";

const SIZE = { width: 40, height: 20 };

/** A model with an opted-in `tank` type limited to 20..200 x 10..100. */
function tankModel(options: GraphModelOptions = {}) {
  const model = makeModel(options);
  model.registry.register({
    type: "tank",
    label: "Tank",
    defaultSize: SIZE,
    capabilities: { resize: true },
    sizeLimits: {
      min: { width: 20, height: 10 },
      max: { width: 200, height: 100 },
    },
  });
  return model;
}

function nodeOf(model: ReturnType<typeof makeModel>, id: string): NodeRecord {
  const node = model.reader.getNode(id as never);
  if (!node) throw new Error(`no node ${id}`);
  return node;
}

describe("resizeNode command", () => {
  it("plans one node update labelled Resize and applies it", () => {
    const model = tankModel();
    const a = make(model, "tank", 100, 50);
    const plan = model.plan({
      kind: "resizeNode",
      node: a.node,
      size: { width: 60, height: 30 },
    });
    expect(plan.kind === "ready" && plan.label).toBe("Resize");
    expect(plan.kind === "ready" && plan.patch.ops).toEqual([
      {
        op: "update",
        entity: "node",
        id: a.node,
        fields: { size: { old: SIZE, new: { width: 60, height: 30 } } },
      },
    ]);
    expect(model.resizeNode(a.node, { width: 60, height: 30 }).status).toBe(
      "accepted",
    );
    // The centre is the default fixed point.
    expect(nodeOf(model, a.node).position).toEqual({ x: 100, y: 50 });
    expect(nodeOf(model, a.node).size).toEqual({ width: 60, height: 30 });
  });

  it("Command outside the limits is rejected with out-of-range naming the node", () => {
    const model = tankModel();
    const a = make(model, "tank", 5, 5);
    for (const size of [
      { width: 201, height: 20 },
      { width: 19, height: 20 },
      { width: 40, height: 101 },
    ]) {
      const result = model.resizeNode(a.node, size, { x: -1, y: -1 });
      expect(result.status).toBe("rejected");
      if (result.status === "rejected") {
        expect(result.error.code).toBe("out-of-range");
        expect(result.error.entities).toEqual([a.node]);
      }
    }
    expect(nodeOf(model, a.node).size).toEqual(SIZE);
    expect(nodeOf(model, a.node).position).toEqual({ x: 5, y: 5 });
  });

  it("rejects unknown nodes and non-finite or negative sizes", () => {
    const model = tankModel();
    const a = make(model, "tank");
    const code = (r: ReturnType<typeof model.resizeNode>) =>
      r.status === "rejected" ? r.error.code : r.status;
    expect(code(model.resizeNode("n404" as never, SIZE))).toBe(
      "unknown-entity",
    );
    expect(
      code(model.resizeNode(a.node, { width: Number.NaN, height: 20 })),
    ).toBe("non-finite");
    expect(code(model.resizeNode(a.node, { width: -5, height: 20 }))).toBe(
      "non-finite",
    );
  });

  it("an unchanged size plans nothing and adds no history entry", () => {
    const model = tankModel();
    const a = make(model, "tank");
    const before = model.historyState();
    const plan = model.plan({ kind: "resizeNode", node: a.node, size: SIZE });
    expect(plan.kind === "ready" && plan.patch.ops).toEqual([]);
    model.resizeNode(a.node, SIZE);
    expect(model.historyState()).toEqual(before);
  });

  it("Opposite side stays fixed on a rotated node", () => {
    const model = tankModel();
    const a = make(model, "tank", 100, 100);
    model.rotateNodes([a.node], 1);
    model.mirrorNodes([a.node]);
    const before = nodeOf(model, a.node);
    const leftMid = (n: NodeRecord) => {
      const v = frameVector(n, { x: -n.size.width / 2, y: 0 });
      return { x: n.position.x + v.x, y: n.position.y + v.y };
    };
    const result = model.resizeNode(
      a.node,
      { width: 80, height: 20 },
      { x: -1, y: 0 },
    );
    expect(result.status).toBe("accepted");
    const after = nodeOf(model, a.node);
    expect(leftMid(after)).toEqual(leftMid(before));
    // The centre moved by half the width change along the local +x axis in world.
    const normal = frameVector(before, { x: 1, y: 0 });
    expect(after.position).toEqual({
      x: before.position.x + 20 * normal.x,
      y: before.position.y + 20 * normal.y,
    });
  });

  it("Instance limits refine type limits for the command", () => {
    const model = tankModel({
      sizeLimits: (node) =>
        node.title === "big" ? { min: { width: 40, height: 10 } } : undefined,
    });
    model.createNode("tank", { x: 0, y: 0 }, { title: "big" });
    const big = model.reader.nodes().at(-1)?.id;
    const plain = make(model, "tank").node;
    if (!big) throw new Error("no node");
    const w30 = { width: 30, height: 20 };
    const refused = model.resizeNode(big, w30);
    expect(refused.status === "rejected" && refused.error.code).toBe(
      "out-of-range",
    );
    expect(model.resizeNode(plain, w30).status).toBe("accepted");
  });
});
