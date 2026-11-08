/// <reference types="@vitest/browser-playwright" />
import { describe, expect, it, vi } from "vitest";
import {
  createOrthogonalRouter,
  createRouteRegistry,
  type RouteRegistry,
} from "../../../core/index.js";
import {
  buildModel,
  twoPortNode,
} from "../../../core/space/scene/scene-fixtures.js";
import {
  cleanupScope,
  frames,
  makeHost,
  pixelAt,
  selConn,
} from "../../browser-support.js";
import { mountView } from "../../mount-view.js";
import { createConnectionPainter } from "../presets/connection-painter.js";
import { createPainterRegistries } from "../registries/painters.js";

const cleanup = cleanupScope();

/**
 * c1 runs (120,100) -> (250,100) -> (250,250) -> (380,250) at zoom 1, pan 0. Nodes
 * and port glyphs paint nothing, so scene pixels come from the connection only.
 */
async function mount(routes: RouteRegistry, painterOptions = {}) {
  const model = buildModel(
    [twoPortNode("a", 100, 100), twoPortNode("b", 400, 250)],
    [["c1", "a", "aR", "b", "bL"]],
  );
  const painters = createPainterRegistries();
  painters.nodes.replace("t", { paint: () => {} });
  painters.portGlyphs.replace("k", { paint: () => {} });
  painters.connections.replace(
    "default",
    createConnectionPainter(painterOptions),
  );
  const view = mountView(makeHost(500, 350), {
    model,
    painters,
    routes,
    initialViewport: { zoom: 1, panX: 0, panY: 0 },
  });
  cleanup(() => view.dispose());
  await frames();
  const alpha = (x: number, y: number) => pixelAt(view.canvases.scene, x, y)[3];
  return { view, alpha };
}

const orthogonal = (cornerRadius = 0) =>
  createRouteRegistry({ default: createOrthogonalRouter({ cornerRadius }) });

describe("painting orthogonal connections", () => {
  it("pixels on each segment are painted; the sharp corner is painted", async () => {
    const { alpha } = await mount(orthogonal());
    expect(alpha(185, 100)).toBeGreaterThan(0);
    expect(alpha(250, 175)).toBeGreaterThan(0);
    expect(alpha(315, 250)).toBeGreaterThan(0);
    expect(alpha(250, 100)).toBeGreaterThan(0);
    // Away from the wire nothing is drawn.
    expect(alpha(185, 175)).toBe(0);
  });

  it("a rounded corner leaves the sharp corner point unpainted", async () => {
    const { alpha } = await mount(orthogonal(20));
    expect(alpha(250, 100)).toBe(0);
    expect(alpha(250, 250)).toBe(0);
    // The arc's midpoint lies 20 * (sqrt(2) - 1) inside the corner.
    const inset = 20 * (Math.SQRT2 - 1) * Math.SQRT1_2;
    expect(alpha(250 - inset, 100 + inset)).toBeGreaterThan(0);
    expect(alpha(185, 100)).toBeGreaterThan(0);
  });

  it("the arrowhead points along the target's inward escape direction", async () => {
    const { alpha } = await mount(orthogonal(), { arrowhead: true });
    // The last segment runs +x into the left-facing port at (380, 250): the arrow's
    // base is 10 units back, 4.5 wide on each side.
    expect(alpha(373, 247.5)).toBeGreaterThan(0);
    expect(alpha(373, 244)).toBe(0);
    // Nothing points up or down from the port.
    expect(alpha(380, 241)).toBe(0);
  });

  it("a dashed kind stays dashed around corners", async () => {
    const { alpha } = await mount(orthogonal(10), { dash: [3, 3] });
    const runs = (pts: [number, number][]) => {
      const on = pts.filter(([x, y]) => alpha(x, y) > 0).length;
      return { on, off: pts.length - on };
    };
    const along = (n: number, f: (i: number) => [number, number]) =>
      Array.from({ length: n }, (_, i) => f(i));
    const first = runs(along(100, (i) => [130 + i, 100]));
    const middle = runs(along(120, (i) => [250, 115 + i]));
    const last = runs(along(100, (i) => [265 + i, 250]));
    for (const r of [first, middle, last]) {
      expect(r.on).toBeGreaterThan(20);
      expect(r.off).toBeGreaterThan(20);
    }
  });

  it("the selection outline follows the polyline", async () => {
    const { view, alpha } = await mount(orthogonal());
    expect(alpha(252, 175)).toBe(0);
    view.selection.replace([selConn("c1")]);
    await frames();
    expect(alpha(252, 175)).toBeGreaterThan(0);
    expect(alpha(185, 102)).toBeGreaterThan(0);
    expect(alpha(185, 175)).toBe(0);
  });
});

describe("orthogonal connections in the overview", () => {
  it("endpoints still meet the port anchors; corners are drawn without arcs", async () => {
    const big = { w: 200, h: 100 };
    const model = buildModel(
      [twoPortNode("a", -1500, -500, big), twoPortNode("b", 1500, 500, big)],
      [["c1", "a", "aR", "b", "bL"]],
    );
    const view = mountView(makeHost(600, 400), {
      model,
      routes: createRouteRegistry({
        default: createOrthogonalRouter({ cornerRadius: 50 }),
      }),
      initialViewport: { zoom: 0.1, panX: 300, panY: 200 },
    });
    cleanup(() => view.dispose());
    await frames();
    const alpha = (x: number, y: number) =>
      pixelAt(view.canvases.scene, x, y)[3];
    // Screen path: (160,150) -> (300,150) -> (300,250) -> (440,250).
    expect(alpha(162, 150)).toBeGreaterThan(0);
    expect(alpha(438, 250)).toBeGreaterThan(0);
    expect(alpha(300, 200)).toBeGreaterThan(0);
    expect(alpha(300, 150)).toBeGreaterThan(0);
  });

  it("a polyline under 12 CSS px on screen is one straight segment; a larger one keeps its corners", async () => {
    const big = { w: 200, h: 100 };
    // "s" -> "t" spans 60 x 60 world units, 6 CSS px at zoom 0.1.
    const model = buildModel(
      [
        twoPortNode("s", 0, 0),
        twoPortNode("t", 100, 60),
        twoPortNode("a", -1500, -500, big),
        twoPortNode("b", 1500, 500, big),
      ],
      [
        ["small", "s", "sR", "t", "tL"],
        ["large", "a", "aR", "b", "bL"],
      ],
    );
    const view = mountView(makeHost(600, 400), {
      model,
      routes: createRouteRegistry({ default: createOrthogonalRouter() }),
      initialViewport: { zoom: 0.1, panX: 300, panY: 200 },
    });
    cleanup(() => view.dispose());
    await frames();
    const ctx = view.canvases.scene.getContext("2d");
    if (!ctx) throw new Error("no context");
    // Overview connections are traced with moveTo and lineTo only, in world units.
    const paths: { x: number; y: number }[][] = [];
    const moveTo = vi.spyOn(ctx, "moveTo").mockImplementation((x, y) => {
      paths.push([{ x, y }]);
      CanvasRenderingContext2D.prototype.moveTo.call(ctx, x, y);
    });
    const lineTo = vi.spyOn(ctx, "lineTo").mockImplementation((x, y) => {
      paths[paths.length - 1]?.push({ x, y });
      CanvasRenderingContext2D.prototype.lineTo.call(ctx, x, y);
    });
    view.viewport.panBy(1, 0);
    await frames();
    moveTo.mockRestore();
    lineTo.mockRestore();
    const startingAt = (x: number, y: number) =>
      paths.filter((p) => p[0]?.x === x && p[0]?.y === y);
    expect(startingAt(20, 0)).toEqual([
      [
        { x: 20, y: 0 },
        { x: 80, y: 60 },
      ],
    ]);
    const large = startingAt(-1400, -500);
    expect(large.length).toBe(1);
    expect(large[0]?.length).toBe(4);
    expect(large[0]?.[3]).toEqual({ x: 1400, y: 500 });
  });
});
