import { describe, expect, it } from "vitest";
import { make, makeModel } from "./test-kit.js";

describe("UC-02 move, rotate, mirror", () => {
  it("moves several nodes as one patch and one history entry", () => {
    const model = makeModel();
    const a = make(model, "source");
    const b = make(model, "sink");
    const events: number[] = [];
    model.on("change", (e) => events.push(e.patch.ops.length));
    model.moveNodes([
      { node: a.node, position: { x: 10, y: 10 } },
      { node: b.node, position: { x: 20, y: 20 } },
    ]);
    expect(events).toEqual([2]);
    expect(model.reader.getNode(b.node)?.position).toEqual({ x: 20, y: 20 });
    model.undo();
    expect(model.reader.getNode(a.node)?.position).toEqual({ x: 0, y: 0 });
    expect(model.reader.getNode(b.node)?.position).toEqual({ x: 0, y: 0 });
  });

  it("rotates modulo 4 for +1 and -1", () => {
    const model = makeModel();
    const a = make(model, "source");
    const turn = (t: 1 | -1) => {
      model.rotateNodes([a.node], t);
      return model.reader.getNode(a.node)?.rotation;
    };
    expect([turn(-1), turn(1), turn(1), turn(1), turn(1), turn(1)]).toEqual([
      3, 0, 1, 2, 3, 0,
    ]);
  });

  it("toggles mirror", () => {
    const model = makeModel();
    const a = make(model, "source");
    model.mirrorNodes([a.node]);
    expect(model.reader.getNode(a.node)?.mirrored).toBe(true);
    model.mirrorNodes([a.node]);
    expect(model.reader.getNode(a.node)?.mirrored).toBe(false);
  });

  it("rejects unknown nodes", () => {
    const model = makeModel();
    expect(model.mirrorNodes(["x" as never]).status).toBe("rejected");
  });
});

describe("MOD-08 explicit reorder", () => {
  it("bring to front changes z through a visible update op", () => {
    const model = makeModel();
    const a = make(model, "source");
    const b = make(model, "source");
    const c = make(model, "source");
    const plan = model.plan({
      kind: "reorderNodes",
      nodes: [a.node],
      to: "front",
    });
    expect(
      plan.kind === "ready" && plan.patch.ops.map((o) => `${o.op}:${o.entity}`),
    ).toEqual(["update:node"]);
    model.reorderNodes([a.node], "front");
    expect(model.reader.paintOrder().map((n) => n.id)).toEqual([
      b.node,
      c.node,
      a.node,
    ]);
    model.reorderNodes([c.node], "back");
    expect(model.reader.paintOrder().map((n) => n.id)).toEqual([
      c.node,
      b.node,
      a.node,
    ]);
    model.undo();
    expect(model.reader.paintOrder().map((n) => n.id)).toEqual([
      b.node,
      c.node,
      a.node,
    ]);
  });
});
