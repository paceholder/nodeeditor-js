/// <reference types="@vitest/browser-playwright" />
import { describe, expect, it } from "vitest";
import {
  type ConnectionId,
  connectionId,
  createOrthogonalRouter,
  createRouteRegistry,
  type PathGeometry,
  type RouteConstraint,
} from "../core/index.js";
import { buildModel, twoPortNode } from "../core/space/scene/scene-fixtures.js";
import { cleanupScope, frames, makeHost } from "./browser-support.js";
import { mouse } from "./interact/input/input-test-support.js";
import { createOrthogonalSegmentEditor } from "./interact/route-edit/orthogonal-segment-editor.js";
import { mountView } from "./mount-view.js";
import { createPainterRegistries } from "./render/registries/painters.js";
import {
  createRouteEditorRegistry,
  type RouteEditor,
} from "./render/registries/route-editor-registry.js";

const cleanup = cleanupScope();

const V = (at: number): RouteConstraint => ({
  kind: "segment",
  orientation: "vertical",
  at,
});

type Layer = "scene" | "interaction";

/**
 * Two S-shaped wires, c1 a -> b and c2 c -> d. c1 runs (120,100) (250,100) (250,250)
 * (380,250): its vertical middle segment is at x = 250, midpoint (250, 175).
 */
async function setup(
  editor: RouteEditor | false = createOrthogonalSegmentEditor(),
) {
  const model = buildModel(
    [
      twoPortNode("a", 100, 100),
      twoPortNode("b", 400, 250),
      twoPortNode("c", 100, 400),
      twoPortNode("d", 400, 550),
    ],
    [
      ["c1", "a", "aR", "b", "bL"],
      ["c2", "c", "cR", "d", "dL"],
    ],
  );
  const painters = createPainterRegistries();
  // The last path painted per wire and layer, as x coordinates of its vertical runs.
  const painted = new Map<string, number[]>();
  painters.connections.replace("default", {
    paint(ctx, i) {
      const path = i.path as PathGeometry;
      if (path.kind !== "polyline") return;
      const layer: Layer =
        ctx.canvas === view.canvases.scene ? "scene" : "interaction";
      const pts = [path.p0, ...path.via, path.p1];
      const xs = pts.flatMap((p, k) =>
        k > 0 && pts[k - 1]?.x === p.x && pts[k - 1]?.y !== p.y ? [p.x] : [],
      );
      painted.set(`${layer}:${i.connection.id}`, xs);
    },
  });
  const routeEditors = createRouteEditorRegistry();
  if (editor) routeEditors.register("default", editor);
  const view = mountView(makeHost(600, 800), {
    model,
    painters,
    routes: createRouteRegistry({ default: createOrthogonalRouter() }),
    routeEditors,
    initialViewport: { zoom: 1, panX: 0, panY: 0 },
  });
  cleanup(() => view.dispose());
  // Count 8 px grip squares drawn on either canvas.
  const grips = { count: 0 };
  for (const canvas of [view.canvases.scene, view.canvases.interaction]) {
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    const rect = ctx.rect.bind(ctx);
    ctx.rect = (x: number, y: number, w: number, h: number) => {
      if (w === 8 && h === 8) grips.count++;
      rect(x, y, w, h);
    };
  }
  await frames();
  const c1 = connectionId("c1");
  const c2 = connectionId("c2");
  const xs = (layer: Layer, id: ConnectionId) => painted.get(`${layer}:${id}`);
  return { model, view, c1, c2, grips, xs };
}

describe("route editing in a mounted view", () => {
  it("grips are painted on a selected orthogonal wire only", async () => {
    const { view, c1, grips } = await setup();
    expect(grips.count).toBe(0);
    view.selection.replace([`c:${c1}`]);
    await frames();
    expect(grips.count).toBeGreaterThan(0);
  });

  it("Move a middle segment: one history entry, painted 40 units right, undo restores", async () => {
    const { model, view, c1, xs } = await setup();
    view.selection.replace([`c:${c1}`]);
    await frames();
    expect(xs("scene", c1)).toContain(250);
    const changes: number[] = [];
    model.on("change", (e) => changes.push(e.patch.ops.length));
    const m = mouse(view);
    m.down(250, 175);
    m.move(270, 175);
    m.move(290, 175);
    await frames();
    // The preview paints the tentative shape; the model has not changed yet.
    expect(xs("interaction", c1)).toContain(290);
    expect(changes).toEqual([]);
    m.up(290, 175);
    await frames();
    expect(changes).toEqual([1]);
    expect(model.historyState().undoLabel).toBe("Edit route");
    expect(model.reader.getConnection(c1)?.route).toEqual([V(290)]);
    expect(xs("scene", c1)).toContain(290);
    expect(xs("scene", c1)).not.toContain(250);
    model.undo();
    await frames();
    expect(model.reader.getConnection(c1)?.route).toBeUndefined();
    expect(xs("scene", c1)).toContain(250);
  });

  it("Escape during the drag leaves the model unchanged", async () => {
    const { model, view, c1, xs } = await setup();
    view.selection.replace([`c:${c1}`]);
    await frames();
    const m = mouse(view);
    m.down(250, 175);
    m.move(300, 175);
    view.element.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    m.up(300, 175);
    await frames();
    expect(model.reader.getConnection(c1)?.route).toBeUndefined();
    expect(xs("scene", c1)).toContain(250);
  });

  it("hovering a grip of a selected wire shows the resize cursor", async () => {
    const { view, c1 } = await setup();
    mouse(view).move(250, 175);
    expect(view.element.style.cursor).toBe("");
    view.selection.replace([`c:${c1}`]);
    await frames();
    mouse(view).move(251, 175);
    expect(view.element.style.cursor).toBe("ew-resize");
    mouse(view).move(300, 175);
    expect(view.element.style.cursor).toBe("");
  });

  it("a double-click on a pinned segment frees it", async () => {
    const { model, view, c1 } = await setup();
    model.execute({ kind: "setRoute", connection: c1, route: [V(300)] });
    view.selection.replace([`c:${c1}`]);
    await frames();
    const m = mouse(view);
    m.down(300, 175);
    m.up(300, 175);
    m.down(300, 175);
    m.up(300, 175);
    await frames();
    expect(model.reader.getConnection(c1)?.route).toBeUndefined();
  });

  it("route.reset clears two selected wires in one entry and is unavailable without pins", async () => {
    const { model, view, c1, c2 } = await setup();
    view.selection.replace([`c:${c1}`, `c:${c2}`]);
    expect(view.commands.availability("route.reset").available).toBe(false);
    model.execute({ kind: "setRoute", connection: c1, route: [V(260)] });
    model.execute({ kind: "setRoute", connection: c2, route: [V(270)] });
    expect(view.commands.availability("route.reset").available).toBe(true);
    const changes: number[] = [];
    model.on("change", (e) => changes.push(e.patch.ops.length));
    expect(view.commands.run("route.reset").ok).toBe(true);
    expect(changes).toEqual([2]);
    expect(model.reader.getConnection(c1)?.route).toBeUndefined();
    expect(model.reader.getConnection(c2)?.route).toBeUndefined();
    expect(model.historyState().undoLabel).toBe("Reset route");
    expect(view.commands.availability("route.reset").available).toBe(false);
  });

  it("a kind without an editor: dragging a selected wire changes nothing", async () => {
    const { model, view, c1 } = await setup(false);
    view.selection.replace([`c:${c1}`]);
    await frames();
    const before = model.historyState().undoLabel;
    mouse(view).drag([250, 175], [300, 175]);
    await frames();
    expect(model.reader.getConnection(c1)?.route).toBeUndefined();
    expect(model.historyState().undoLabel).toBe(before);
  });

  it("Editor replaced: presses use the host editor", async () => {
    const { model, view, c1 } = await setup();
    const host: RouteEditor = {
      handles: () => [
        {
          id: "g",
          at: { x: 250, y: 175 },
          pinned: false,
          role: "move" as const,
        },
      ],
      hit: (_e, w, tol) =>
        Math.hypot(w.x - 250, w.y - 175) <= tol
          ? {
              id: "g",
              at: { x: 250, y: 175 },
              pinned: false,
              role: "move" as const,
            }
          : undefined,
      drag: (_e, _h, _s, w) => [V(w.x + 1000)],
      activate: () => undefined,
      cursor: () => "move",
    };
    view.routeEditors.replace("default", host);
    view.selection.replace([`c:${c1}`]);
    await frames();
    mouse(view).drag([250, 175], [270, 175]);
    await frames();
    expect(model.reader.getConnection(c1)?.route).toEqual([V(1270)]);
  });
});
