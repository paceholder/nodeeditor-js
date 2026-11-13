import { describe, expect, it, vi } from "vitest";
import {
  createGeometryRegistry,
  createGeometryScene,
  createImageSymbolGeometry,
} from "../../../core/index.js";
import {
  buildModel,
  twoPortNode,
} from "../../../core/space/scene/scene-fixtures.js";
import { fakeContext, testFrame } from "../../test-support.js";
import { createAssetService } from "../assets/asset-service.js";
import {
  DEFAULT_Z_ORDER,
  EMPTY_VIEW_STATE,
  paintScene,
} from "../paint/scene-layer.js";
import {
  fallbackConnectionPainter,
  fallbackNodePainter,
  fallbackPortGlyphPainter,
} from "./fallback-painters.js";
import type { NodePainter, PortGlyphPainter } from "./painter-types.js";
import { createPainterRegistries } from "./painters.js";

function fixture() {
  const model = buildModel(
    [twoPortNode("a", 0, 0), twoPortNode("b", 200, 0)],
    [["c1", "a", "aR", "b", "bL"]],
  );
  const geometry = createGeometryRegistry();
  const scene = createGeometryScene(model, { registry: geometry });
  const painters = createPainterRegistries();
  const deps = {
    reader: model.reader,
    scene,
    painters,
    zOrder: DEFAULT_Z_ORDER,
    state: EMPTY_VIEW_STATE,
    assets: createAssetService(),
  };
  return { model, geometry, scene, painters, deps };
}

describe("painter registries", () => {
  it("unregistered keys fall back and register rejects duplicates", () => {
    const { painters } = fixture();
    expect(painters.nodes.get("unknown")).toBe(fallbackNodePainter);
    expect(painters.portGlyphs.get("unknown")).toBe(fallbackPortGlyphPainter);
    expect(painters.connections.get("unknown")).toBe(fallbackConnectionPainter);
    const custom: NodePainter = { paint: () => {} };
    expect(painters.nodes.register("t", custom).ok).toBe(true);
    expect(painters.nodes.register("t", custom).ok).toBe(false);
    expect(painters.nodes.get("t")).toBe(custom);
    painters.nodes.replace("t", fallbackNodePainter);
    expect(painters.nodes.get("t")).toBe(fallbackNodePainter);
  });

  it("something visible is drawn with no registrations", () => {
    const { deps } = fixture();
    const { ctx, calls } = fakeContext();
    const stats = paintScene(ctx, deps, testFrame());
    expect(stats).toEqual({ nodes: 2, connections: 1, groups: 0 });
    expect(calls).toContain("roundRect");
    expect(calls).toContain("bezierCurveTo");
    expect(calls).toContain("arc"); // port glyphs
  });

  it("new port glyph only: other painters and geometry unchanged", () => {
    const { deps, painters, scene } = fixture();
    // Counting painters for nodes and connections (the shipped fallbacks are frozen).
    const nodeSpy = vi.fn(fallbackNodePainter.paint);
    const connSpy = vi.fn(fallbackConnectionPainter.paint);
    painters.nodes.replace("t", { paint: nodeSpy });
    painters.connections.replace("default", { paint: connSpy });
    const before = scene.node("a" as never)?.paintedBounds;
    const glyphs: string[] = [];
    const glyph: PortGlyphPainter = {
      paint: (_c, input) => void glyphs.push(input.port.id),
    };
    painters.portGlyphs.register("k", glyph);
    paintScene(fakeContext().ctx, deps, testFrame());
    expect(glyphs.sort()).toEqual(["aL", "aR", "bL", "bR"]);
    expect(nodeSpy).toHaveBeenCalledTimes(2);
    expect(connSpy).toHaveBeenCalledTimes(1);
    expect(scene.node("a" as never)?.paintedBounds).toEqual(before);
  });

  it("reuse painter with new geometry: same painter, new bounds", () => {
    const { deps, painters, geometry, scene } = fixture();
    const seen: number[] = [];
    const painter: NodePainter = {
      paint: (_c, input) => void seen.push(input.bounds.w),
    };
    painters.nodes.register("t", painter);
    paintScene(fakeContext().ctx, deps, testFrame());
    geometry.replace("t", {
      ...createImageSymbolGeometry(),
      bodyBounds: () => ({ x: -50, y: -10, w: 100, h: 20 }),
    });
    seen.length = 0;
    paintScene(fakeContext().ctx, deps, testFrame());
    expect(painters.nodes.get("t")).toBe(painter);
    expect(seen).toEqual([100, 100]); // body now 100 wide (stored size was 40)
    expect(scene.node("a" as never)?.bodyBounds.w).toBe(100);
  });

  it("registering a painter notifies subscribers once", () => {
    const { painters } = fixture();
    const changed = vi.fn();
    const off = painters.nodes.onChange(changed);
    painters.nodes.register("x", fallbackNodePainter);
    expect(changed).toHaveBeenCalledTimes(1);
    off();
    painters.nodes.replace("x", fallbackNodePainter);
    expect(changed).toHaveBeenCalledTimes(1);
  });
});
