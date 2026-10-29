import { describe, expect, it } from "vitest";
import { mkNode, mkPort } from "../../../data/model/test-helpers.js";
import type { QuarterTurns } from "../../../data/model/values.js";
import { applyPoint, applyVector } from "../affine.js";
import type { NodeView } from "../node-geometry.js";
import { nodeTransform } from "../node-transform.js";
import { shapeContains } from "../shapes.js";
import { createImageSymbolGeometry } from "./image-symbol-geometry.js";

function symbol(
  placements: { x: number; y: number; normal?: { x: number; y: number } }[],
  over: { rotation?: QuarterTurns; mirrored?: boolean } = {},
): NodeView {
  const ports = placements.map((placement, i) =>
    mkPort(`p${i}`, "n1", { placement }),
  );
  return {
    node: mkNode("n1", {
      size: { width: 25, height: 49 },
      position: { x: 100, y: 50 },
      ports: ports.map((p) => p.id),
      ...over,
    }),
    ports: ports,
  };
}

describe("GEO-02b image-symbol port placement", () => {
  it("GEO-02b custom port positions: top edge, left edge and interior (NOD-03)", () => {
    const v = symbol([
      { x: 0.5, y: 0 },
      { x: 0, y: 0.5 },
      { x: 0.5, y: 0.5 },
    ]);
    const g = createImageSymbolGeometry();
    const anchors = g.anchors(v);
    expect(anchors.map((a) => a.position)).toEqual([
      { x: 0, y: -24.5 },
      { x: -12.5, y: 0 },
      { x: 0, y: 0 },
    ]);
    // Normals point out of the nearest edge when not given.
    expect(anchors[0]?.normal).toEqual({ x: 0, y: -1 });
    expect(anchors[1]?.normal).toEqual({ x: -1, y: 0 });
    const t = nodeTransform(v.node);
    expect(applyPoint(t, anchors[0]?.position ?? { x: 0, y: 0 })).toEqual({
      x: 100,
      y: 25.5,
    });
  });

  it("GEO-02b non-rectangular outline and explicit normal override", () => {
    const g = createImageSymbolGeometry({
      outline: [
        { x: 0.5, y: 0 },
        { x: 1, y: 0.5 },
        { x: 0.5, y: 1 },
        { x: 0, y: 0.5 },
      ],
    });
    const v = symbol([{ x: 1, y: 0.5, normal: { x: 0, y: 3 } }]);
    const shape = g.hitShape(v);
    expect(shapeContains(shape, { x: 0, y: 0 })).toBe(true);
    expect(shapeContains(shape, { x: 11, y: 22 })).toBe(false);
    expect(g.anchors(v)[0]?.normal).toEqual({ x: 0, y: 1 });
  });

  it("GEO-02b resolution order: durable, then type-level, then even distribution", () => {
    const ports = [
      mkPort("a", "n1", { placement: { x: 1, y: 1 } }),
      mkPort("b", "n1"),
      mkPort("c", "n1", { direction: "output" }),
    ];
    const v: NodeView = {
      node: mkNode("n1", { size: { width: 20, height: 20 } }),
      ports,
    };
    const g = createImageSymbolGeometry({
      typePlacement: (p) => (p.id === "b" ? { x: 0, y: 0 } : undefined),
    });
    const a = g.anchors(v);
    expect(a.map((x) => x.portId)).toEqual(["a", "b", "c"]);
    expect(a[0]?.position).toEqual({ x: 10, y: 10 });
    expect(a[1]?.position).toEqual({ x: -10, y: -10 });
    expect(a[2]?.position).toEqual({ x: 10, y: 0 });
  });

  it("GEO-02a mirrored anchor normal: a right-facing port faces left after mirroring", () => {
    const v = symbol([{ x: 1, y: 0.5 }], { mirrored: true });
    const anchor = createImageSymbolGeometry().anchors(v)[0];
    if (!anchor) throw new Error("setup");
    expect(anchor.normal).toEqual({ x: 1, y: 0 });
    const t = nodeTransform(v.node);
    expect(applyPoint(t, anchor.position)).toEqual({ x: 87.5, y: 50 });
    expect(applyVector(t, anchor.normal)).toEqual({ x: -1, y: 0 });
  });
});
