import { describe, expect, it } from "vitest";
import { mkNode, mkPort } from "../../data/model/test-helpers.js";
import {
  createGeometryRegistry,
  placeholderGeometry,
} from "./geometry-registry.js";
import type { NodeView } from "./node-geometry.js";
import { createImageSymbolGeometry } from "./presets/image-symbol-geometry.js";
import { shapeBounds, shapeContains } from "./shapes.js";

const view = (nPorts: number, dirs: ("input" | "output")[] = []): NodeView => {
  const ports = Array.from({ length: nPorts }, (_, i) =>
    mkPort(`p${i}`, "n1", { direction: dirs[i] ?? "input" }),
  );
  return {
    node: mkNode("n1", {
      size: { width: 25, height: 49 },
      ports: ports.map((p) => p.id),
    }),
    ports,
  };
};

describe("node geometry contract", () => {
  it("portless node: valid body, hit shape and no anchors", () => {
    const v = view(0);
    const g = placeholderGeometry;
    expect(g.anchors(v)).toEqual([]);
    expect(g.bodyBounds(v)).toEqual({ x: -12.5, y: -24.5, w: 25, h: 49 });
    expect(shapeContains(g.hitShape(v), { x: 0, y: 0 })).toBe(true);
    expect(g.paintedBounds(v)).toEqual(g.bodyBounds(v));
  });

  it("placeholder geometry: unknown types get a rectangle with spaced ports", () => {
    const registry = createGeometryRegistry();
    expect(registry.has("mystery")).toBe(false);
    const g = registry.get("mystery");
    expect(g).toBe(placeholderGeometry);
    const v = view(3, ["input", "input", "output"]);
    expect(shapeBounds(g.hitShape(v))).toEqual({
      x: -12.5,
      y: -24.5,
      w: 25,
      h: 49,
    });
    const anchors = g.anchors(v);
    expect(anchors.map((a) => a.portId)).toEqual(["p0", "p1", "p2"]);
    // Two inputs share the left edge, evenly spaced; the output sits mid right edge.
    expect(anchors[0]?.position).toEqual({ x: -12.5, y: -24.5 + 49 / 3 });
    expect(anchors[1]?.position.y).toBeCloseTo(-24.5 + (49 * 2) / 3, 9);
    expect(anchors[0]?.normal).toEqual({ x: -1, y: 0 });
    expect(anchors[2]?.position).toEqual({ x: 12.5, y: 0 });
    expect(anchors[2]?.normal).toEqual({ x: 1, y: 0 });
  });

  it("geometry independent of painter: registration involves geometry only", () => {
    const registry = createGeometryRegistry();
    const seen: string[] = [];
    registry.onChange((t) => seen.push(t));
    const custom = createImageSymbolGeometry({ paintedMargin: 4 });
    expect(registry.register("symbol", custom).ok).toBe(true);
    const dup = registry.register("symbol", custom);
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.rejection.code).toBe("duplicate-type");
    expect(registry.get("symbol")).toBe(custom);
    expect(registry.get("other")).toBe(placeholderGeometry);
    registry.replace("symbol", placeholderGeometry);
    expect(seen).toEqual(["symbol", "symbol"]);
    // The output depends on the node view alone; there is no painter input.
    expect(custom.paintedBounds(view(0))).toEqual({
      x: -16.5,
      y: -28.5,
      w: 33,
      h: 57,
    });
  });
});
