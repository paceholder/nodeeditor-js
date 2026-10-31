import { describe, expect, it } from "vitest";
import { mkNode, mkPort } from "../../../data/model/test-helpers.js";
import type { NodeView } from "../node-geometry.js";
import { rectContainsRect } from "../rect.js";
import { shapeBounds } from "../shapes.js";
import { createCardGeometry } from "./card-geometry.js";

const card: NodeView = {
  node: mkNode("n1", { size: { width: 100, height: 80 } }),
  ports: [
    mkPort("in1", "n1", { direction: "input" }),
    mkPort("out1", "n1", { direction: "output" }),
    mkPort("in2", "n1", { direction: "input" }),
  ],
};

describe("card port rows", () => {
  it("horizontal rows: inputs left, outputs right, model order, below the title", () => {
    const a = createCardGeometry({ titleHeight: 30, rowPitch: 20 }).anchors(
      card,
    );
    expect(a.map((x) => x.portId)).toEqual(["in1", "out1", "in2"]);
    expect(a[0]?.position).toEqual({ x: -50, y: -40 + 30 + 10 });
    expect(a[2]?.position).toEqual({ x: -50, y: -40 + 30 + 30 });
    expect(a[1]?.position).toEqual({ x: 50, y: -40 + 30 + 10 });
    expect(a[0]?.normal).toEqual({ x: -1, y: 0 });
    expect(a[1]?.normal).toEqual({ x: 1, y: 0 });
  });

  it("vertical layout puts inputs on top and outputs on the bottom", () => {
    const a = createCardGeometry({ layout: "vertical" }).anchors(card);
    expect(a[0]?.position.x).toBeCloseTo(-50 + 100 / 3, 9);
    expect(a[0]?.position.y).toBe(-40);
    expect(a[0]?.normal).toEqual({ x: 0, y: -1 });
    expect(a[1]?.position).toEqual({ x: 0, y: 40 });
    expect(a[1]?.normal).toEqual({ x: 0, y: 1 });
  });

  it("rows sit at a fixed distance from the top, clamped to the bottom edge when the body is short", () => {
    const g = createCardGeometry({ titleHeight: 30, rowPitch: 20 });
    const sized = (height: number): NodeView => ({
      ...card,
      node: mkNode("n1", { size: { width: 100, height } }),
    });
    // Tall enough for both input rows (title + 2 rows = 70): rows keep their offsets.
    const tall = g.anchors(sized(120)).map((x) => x.position.y + 60);
    expect([tall[0], tall[2]]).toEqual([40, 60]);
    // Shorter than the rows: the second input stacks on the bottom corner.
    const short = g.anchors(sized(50));
    expect(short[0]?.position).toEqual({ x: -50, y: -25 + 30 + 10 });
    expect(short[2]?.position).toEqual({ x: -50, y: 25 });
  });

  it("rows never extend below the body", () => {
    const small: NodeView = {
      ...card,
      node: mkNode("n1", { size: { width: 100, height: 40 } }),
    };
    const a = createCardGeometry({ titleHeight: 30, rowPitch: 20 }).anchors(
      small,
    );
    for (const x of a) expect(x.position.y).toBeLessThanOrEqual(20);
  });
});

describe("painted vs hit bounds", () => {
  it("painted vs hit bounds: the label margin enlarges painted bounds only", () => {
    const g = createCardGeometry({ labelMargin: 12 });
    const hit = shapeBounds(g.hitShape(card));
    const painted = g.paintedBounds(card);
    expect(hit).toEqual(g.bodyBounds(card));
    expect(painted).toEqual({ x: -62, y: -52, w: 124, h: 104 });
    expect(rectContainsRect(painted, hit)).toBe(true);
    expect(painted.w).toBeGreaterThan(hit.w);
  });
});
