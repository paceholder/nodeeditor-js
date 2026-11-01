/// <reference types="@vitest/browser-playwright" />
import { describe, expect, it, vi } from "vitest";
import {
  connectionId,
  createOrthogonalRouter,
  createRouteRegistry,
  nodeId,
  type PathGeometry,
  portId,
  type RouteRegistry,
} from "../core/index.js";
import { buildModel, twoPortNode } from "../core/space/scene/scene-fixtures.js";
import { cleanupScope, frames, makeHost } from "./browser-support.js";
import { mountView } from "./mount-view.js";
import { createPainterRegistries } from "./render/registries/painters.js";

const cleanup = cleanupScope();

type Painted = { layer: "scene" | "interaction"; id: string; kind: string };

/** a -> b with a `default` connection c1, painted by a recording painter. */
async function setup(routes?: RouteRegistry) {
  const model = buildModel(
    [twoPortNode("a", 100, 100), twoPortNode("b", 400, 250)],
    [["c1", "a", "aR", "b", "bL"]],
  );
  const painted: Painted[] = [];
  const painters = createPainterRegistries();
  const view = mountView(makeHost(500, 350), {
    model,
    painters,
    ...(routes ? { routes } : {}),
    initialViewport: { zoom: 1, panX: 0, panY: 0 },
  });
  cleanup(() => view.dispose());
  const record = {
    paint(
      ctx: CanvasRenderingContext2D,
      i: { connection: { id: string }; path: PathGeometry },
    ) {
      painted.push({
        layer: ctx.canvas === view.canvases.scene ? "scene" : "interaction",
        id: i.connection.id,
        kind: i.path.kind,
      });
    },
  };
  painters.connections.replace("default", record);
  painters.connections.replace("ortho", record);
  await frames();
  return { model, view, painted };
}

const kindsOn = (painted: Painted[], layer: Painted["layer"]) => [
  ...new Set(painted.filter((p) => p.layer === layer).map((p) => p.kind)),
];

describe("ROU-01, REN-04, ROU-12 routes in a mounted view", () => {
  it("ROU-01 a view mounted without routes paints Bezier as before", async () => {
    const { view, painted } = await setup();
    expect(kindsOn(painted, "scene")).toEqual(["cubic"]);
    expect(view.routes.has("default")).toBe(false);
  });

  it("ROU-12 REN-04 replacing a kind's route repaints it orthogonally without remount, history or geometry work", async () => {
    const { model, view, painted } = await setup();
    let backgrounds = 0;
    view.painters.background.set(() => void backgrounds++);
    let interactions = 0;
    view.interaction.add({ order: 0, paint: () => void interactions++ });
    await frames();
    const history = model.historyState();
    const stats = view.geometryStats();
    backgrounds = 0;
    interactions = 0;
    painted.length = 0;

    view.routes.replace("default", createOrthogonalRouter());
    await frames();

    expect(kindsOn(painted, "scene")).toEqual(["polyline"]);
    expect(model.historyState()).toEqual(history);
    const after = view.geometryStats();
    expect(after?.nodeRebuilds).toBe(stats?.nodeRebuilds);
    expect(
      (after?.connectionRebuilds ?? 0) - (stats?.connectionRebuilds ?? 0),
    ).toBe(1);
    expect(backgrounds).toBe(0);
    expect(interactions).toBe(0);
  });
});

describe("ROU-01e, INT-04 routes in previews", () => {
  it("ROU-01e Move preview keeps the orthogonal shape on every frame", async () => {
    const { view, painted } = await setup(
      createRouteRegistry({ default: createOrthogonalRouter() }),
    );
    // The ghost node keeps its local body box while its world box moves with it.
    const bounds: { layer: string; json: string }[] = [];
    view.painters.nodes.replace("t", {
      paint: (ctx, i) =>
        void bounds.push({
          layer: ctx.canvas === view.canvases.scene ? "scene" : "interaction",
          json: JSON.stringify(i.bounds),
        }),
    });
    await frames();
    for (const dy of [10, 40, 80, 120]) {
      painted.length = 0;
      view.setToolPreview({
        kind: "move",
        offset: { x: 0, y: dy },
        moving: [nodeId("a")],
        locked: [],
      });
      await frames(2);
      expect(kindsOn(painted, "interaction")).toEqual(["polyline"]);
    }
    const local = new Set(bounds.map((b) => b.json));
    expect(bounds.some((b) => b.layer === "interaction")).toBe(true);
    expect(local.size).toBe(1);
    view.setToolPreview(null);
  });

  it("ROU-01e a resize preview routes the incident connection orthogonally", async () => {
    const { view, painted } = await setup(
      createRouteRegistry({ default: createOrthogonalRouter() }),
    );
    painted.length = 0;
    view.setToolPreview({
      kind: "resize",
      node: nodeId("a"),
      size: { width: 80, height: 20 },
      position: { x: 120, y: 100 },
      fixed: { x: -1, y: -1 },
    });
    await frames(2);
    expect(kindsOn(painted, "interaction")).toEqual(["polyline"]);
  });

  it("ROU-01e Connection drag with a Bezier default: the provisional path is a cubic, the committed orthogonal kind a polyline", async () => {
    const routes = createRouteRegistry();
    routes.register("ortho", createOrthogonalRouter());
    const { model, view, painted } = await setup(routes);
    const ctx = view.canvases.interaction.getContext("2d");
    if (!ctx) throw new Error("no context");
    const curve = vi.spyOn(ctx, "bezierCurveTo");
    view.setToolPreview({
      kind: "connect",
      source: { node: nodeId("a"), port: portId("aR") },
      pointer: { x: 300, y: 300 },
      target: undefined,
      candidates: [],
    });
    await frames(2);
    expect(curve).toHaveBeenCalled();
    expect(curve.mock.lastCall?.slice(4)).toEqual([300, 300]);
    view.setToolPreview(null);
    curve.mockRestore();

    painted.length = 0;
    const r = model.submit({
      ops: [
        {
          op: "add",
          entity: "connection",
          record: {
            id: connectionId("c2"),
            kind: "ortho",
            from: { node: nodeId("b"), port: portId("bR") },
            to: { node: nodeId("a"), port: portId("aL") },
          },
        },
      ],
    });
    expect(r.status).toBe("accepted");
    await frames();
    const c2 = painted.filter((p) => p.id === "c2" && p.layer === "scene");
    expect(c2.map((p) => p.kind)).toContain("polyline");
  });

  it("INT-04 with an orthogonal default the connect preview is a polyline whose free end follows the pointer", async () => {
    const { view } = await setup(
      createRouteRegistry({ default: createOrthogonalRouter() }),
    );
    const ctx = view.canvases.interaction.getContext("2d");
    if (!ctx) throw new Error("no context");
    const curve = vi.spyOn(ctx, "bezierCurveTo");
    const line = vi.spyOn(ctx, "lineTo");
    for (const pointer of [
      { x: 300, y: 300 },
      { x: 320, y: 40 },
    ]) {
      line.mockClear();
      view.setToolPreview({
        kind: "connect",
        source: { node: nodeId("a"), port: portId("aR") },
        pointer,
        target: undefined,
        candidates: [],
      });
      await frames(2);
      expect(line.mock.calls.map((c) => c.join(","))).toContain(
        `${pointer.x},${pointer.y}`,
      );
    }
    expect(curve).not.toHaveBeenCalled();
    view.setToolPreview(null);
    curve.mockRestore();
    line.mockRestore();
  });
});
