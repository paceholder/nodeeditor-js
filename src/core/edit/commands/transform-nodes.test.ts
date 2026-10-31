import { describe, expect, it } from "vitest";
import type { MirrorAxis } from "../../data/model/node-frame.js";
import type { NodeRecord } from "../../data/model/records.js";
import type { QuarterTurns, Vec2 } from "../../data/model/values.js";
import { applyPoint, applyVector } from "../../space/geometry/affine.js";
import { nodeTransform } from "../../space/geometry/node-transform.js";
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

const TURNS: QuarterTurns[] = [0, 1, 2, 3];
const W = 40;
const H = 20;
/** Edge midpoints, corners and an off-centre point of a 40 x 20 body. */
const LOCAL: Vec2[] = [
  { x: -W / 2, y: 0 },
  { x: W / 2, y: 0 },
  { x: 0, y: -H / 2 },
  { x: 0, y: H / 2 },
  { x: -W / 2, y: -H / 2 },
  { x: W / 2, y: H / 2 },
  { x: 7, y: -3 },
];

function placed(model: ReturnType<typeof makeModel>, id: string): NodeRecord {
  const node = model.reader.getNode(id as never);
  if (!node) throw new Error(`no node ${id}`);
  return node;
}

/** A node at (100, 50) with the given rotation and mirror flag. */
function setUp(rotation: QuarterTurns, mirrored: boolean) {
  const model = makeModel();
  const a = make(model, "source", 100, 50);
  model.submit(
    {
      ops: [
        {
          op: "update",
          entity: "node",
          id: a.node,
          fields: {
            rotation: { old: 0, new: rotation },
            mirrored: { old: false, new: mirrored },
          },
        },
      ],
    },
    { history: "skip" },
  );
  return { model, id: a.node };
}

/** Where a local point lands on screen; the reflection the axis should produce. */
const world = (n: NodeRecord, p: Vec2) => applyPoint(nodeTransform(n), p);
const reflect = (axis: MirrorAxis, c: Vec2, p: Vec2): Vec2 =>
  axis === "horizontal"
    ? { x: 2 * c.x - p.x, y: p.y }
    : { x: p.x, y: 2 * c.y - p.y };

describe("NOD-04 mirror in screen axes", () => {
  it("every rotation and both axes: one op, mirrored toggled, rotation per the table", () => {
    const expected: Record<MirrorAxis, readonly QuarterTurns[]> = {
      horizontal: [0, 3, 2, 1],
      vertical: [2, 1, 0, 3],
    };
    for (const axis of ["horizontal", "vertical"] as const) {
      for (const rotation of TURNS) {
        for (const mirrored of [false, true]) {
          const { model, id } = setUp(rotation, mirrored);
          const before = placed(model, id);
          const plan = model.plan({ kind: "mirrorNodes", nodes: [id], axis });
          expect(plan.kind === "ready" && plan.patch.ops.length).toBe(1);
          model.mirrorNodes([id], axis);
          const after = placed(model, id);
          expect(after.mirrored).toBe(!mirrored);
          expect(after.rotation).toBe(expected[axis][rotation]);
          expect(after.position).toEqual(before.position);
          // Every point of the body lands on its screen reflection.
          for (const p of LOCAL) {
            expect(world(after, p)).toEqual(
              reflect(axis, before.position, world(before, p)),
            );
          }
        }
      }
    }
  });

  it("is unchanged against the old toggle for r = 0 and r = 2", () => {
    for (const rotation of [0, 2] as const) {
      const { model, id } = setUp(rotation, false);
      const plan = model.plan({ kind: "mirrorNodes", nodes: [id] });
      expect(plan.kind === "ready" && plan.patch.ops).toEqual([
        {
          op: "update",
          entity: "node",
          id,
          fields: { mirrored: { old: false, new: true } },
        },
      ]);
    }
  });

  it("Mirror a node vertically: a top port moves to the bottom, facing outward", () => {
    const { model, id } = setUp(0, false);
    const before = placed(model, id);
    model.mirrorNodes([id], "vertical");
    const after = placed(model, id);
    const top = { x: 0, y: -H / 2 };
    const outward = { x: 0, y: -1 };
    expect(world(after, top)).toEqual({ x: 100, y: 50 + H / 2 });
    expect(applyVector(nodeTransform(after), outward)).toEqual({ x: 0, y: 1 });
    expect(after.position).toEqual(before.position);
    expect(model.historyState().undoLabel).toBe("Mirror");
    model.undo();
    expect(placed(model, id)).toMatchObject({ mirrored: false, rotation: 0 });
    expect(model.historyState().undoLabel).not.toBe("Mirror");
  });

  it("Mirror a rotated node: screen-left goes to screen-right, no vertical change", () => {
    const { model, id } = setUp(1, false);
    const before = placed(model, id);
    model.mirrorNodes([id]);
    const after = placed(model, id);
    for (const p of LOCAL) {
      const a = world(before, p);
      const b = world(after, p);
      expect(b.y).toBe(a.y);
      expect(b.x).toBe(200 - a.x);
    }
  });

  it("Vertical mirror of a rotated node: top goes to bottom, no horizontal change", () => {
    const { model, id } = setUp(1, false);
    const before = placed(model, id);
    model.mirrorNodes([id], "vertical");
    const after = placed(model, id);
    for (const p of LOCAL) {
      const a = world(before, p);
      const b = world(after, p);
      expect(b.x).toBe(a.x);
      expect(b.y).toBe(100 - a.y);
    }
  });

  it("Undo a vertical mirror restores both the flag and the rotation", () => {
    const { model, id } = setUp(1, false);
    model.mirrorNodes([id], "vertical");
    expect(placed(model, id)).toMatchObject({ mirrored: true, rotation: 1 });
    model.undo();
    expect(placed(model, id)).toMatchObject({ mirrored: false, rotation: 1 });
    const { model: m3, id: i3 } = setUp(3, true);
    m3.mirrorNodes([i3], "vertical");
    expect(placed(m3, i3)).toMatchObject({ mirrored: false, rotation: 3 });
    const { model: m0, id: i0 } = setUp(0, false);
    m0.mirrorNodes([i0], "vertical");
    expect(placed(m0, i0)).toMatchObject({ mirrored: true, rotation: 2 });
    m0.undo();
    expect(placed(m0, i0)).toMatchObject({ mirrored: false, rotation: 0 });
  });
});
