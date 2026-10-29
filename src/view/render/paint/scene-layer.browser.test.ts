import { describe, expect, it } from "vitest";
import {
  createGeometryScene,
  createGraphModel,
  type SceneLayer,
} from "../../../core/index.js";
import {
  buildModel,
  type NodeSpec,
  submitChunked,
  twoPortNode,
} from "../../../core/space/scene/scene-fixtures.js";
import { cleanupScope, frames, makeHost } from "../../browser-support.js";
import { mountView } from "../../mount-view.js";
import type {
  ConnectionPainter,
  NodePainter,
} from "../registries/painter-types.js";
import { createPainterRegistries } from "../registries/painters.js";

const cleanup = cleanupScope();

describe("scene layer", () => {
  it("LAY-03 large graph navigation: only visible nodes and crossing paths are painted", async () => {
    // 100 x 100 grid, 100 world units apart: 10 000 nodes.
    const specs: NodeSpec[] = [];
    for (let j = 0; j < 100; j++)
      for (let i = 0; i < 100; i++)
        specs.push(twoPortNode(`n${j}_${i}`, i * 100, j * 100));
    const model = createGraphModel();
    // One long connection whose endpoints are both off-screen but whose path crosses it.
    submitChunked(model, specs, [
      ["cLong", "n0_0", "n0_0R", "n0_99", "n0_99L"],
    ]);
    // An independent scene over the same model gives the expected culling answer.
    const scene = createGeometryScene(model);
    cleanup(() => scene.dispose());

    const painted: string[] = [];
    const paintedConnections: string[] = [];
    const painters = createPainterRegistries();
    painters.nodes.replace("t", {
      paint: (_c, i) => void painted.push(i.node.id),
    });
    painters.connections.replace("default", {
      paint: (_c, i) => void paintedConnections.push(i.connection.id),
    });
    const view = mountView(makeHost(800, 600), {
      model,
      painters,
    });
    cleanup(() => view.dispose());
    // Show world x 4000..4800, y 0..600 (endpoints of cLong are off-screen).
    view.viewport.set({ zoom: 1, panX: -4000, panY: 0 });
    await frames();
    painted.length = 0;
    paintedConnections.length = 0;
    view.invalidate("scene");
    await frames();

    const expected = scene
      .queryRect({ x: 4000, y: 0, w: 800, h: 600 }, "painted")
      .filter((it) => it.kind === "node")
      .map((it) => it.id as string);
    expect(painted.length).toBeGreaterThan(30);
    expect(painted.length).toBeLessThan(150); // far fewer than 10 000
    expect([...painted].sort()).toEqual([...expected].sort());
    // Every node whose centre is in view was painted.
    for (const id of painted) {
      const [j, i] = id.slice(1).split("_").map(Number);
      expect(i).toBeGreaterThanOrEqual(39);
      expect(i).toBeLessThanOrEqual(48);
      expect(j).toBeLessThanOrEqual(6);
    }
    expect(paintedConnections).toEqual(["cLong"]);

    // Navigating elsewhere paints a different, equally small set.
    painted.length = 0;
    view.viewport.set({ zoom: 1, panX: -500, panY: -5000 });
    await frames();
    expect(painted.length).toBeGreaterThan(30);
    expect(painted.length).toBeLessThan(150);
    expect(painted.every((id) => Number(id.slice(1).split("_")[0]) >= 49)).toBe(
      true,
    );
  });

  it("VIS-02 override z-order: connections paint above nodes and win picking", async () => {
    const nodes = [
      twoPortNode("a", 0, 0),
      twoPortNode("m", 100, 0, { w: 40, h: 30 }),
      twoPortNode("b", 200, 0),
    ];
    const run = async (layerOrder: readonly SceneLayer[] | undefined) => {
      const model = buildModel(nodes, [["c1", "a", "aR", "b", "bL"]]);
      const scene = createGeometryScene(
        model,
        layerOrder ? { layerOrder } : {},
      );
      cleanup(() => scene.dispose());
      const log: string[] = [];
      const painters = createPainterRegistries();
      const node: NodePainter = { paint: () => void log.push("node") };
      const conn: ConnectionPainter = { paint: () => void log.push("conn") };
      painters.nodes.replace("t", node);
      painters.connections.replace("default", conn);
      const view = mountView(makeHost(400, 200), {
        model,
        painters,
        ...(layerOrder ? { zOrder: layerOrder } : {}),
        initialViewport: { zoom: 1, panX: 100, panY: 100 },
      });
      cleanup(() => view.dispose());
      await frames();
      const top = scene.pick({ x: 100, y: 0 }, { zoom: 1 })[0]?.kind;
      return { log: [...new Set(log)], top };
    };
    const normal = await run(undefined);
    expect(normal.log).toEqual(["conn", "node"]);
    expect(normal.top).toBe("node");
    const flipped = await run(["node", "connection", "port"]);
    expect(flipped.log).toEqual(["node", "conn"]);
    expect(flipped.top).toBe("connection");
  });

  it("LAY-01 pan repaints background and scene, not interaction, and not the model", async () => {
    const model = buildModel([twoPortNode("a", 50, 50)]);
    const counts = { background: 0, scene: 0, interaction: 0 };
    const painters = createPainterRegistries();
    painters.nodes.replace("t", { paint: () => void counts.scene++ });
    painters.background.set(() => void counts.background++);
    const view = mountView(makeHost(300, 200), {
      model,
      painters,
    });
    cleanup(() => view.dispose());
    view.interaction.add({ paint: () => void counts.interaction++ });
    await frames();
    counts.background = counts.scene = counts.interaction = 0;
    const revision = model.revision();
    const stats = view.geometryStats();

    view.viewport.panBy(10, 5);
    view.viewport.panBy(10, 5); // coalesced into one frame
    await frames();
    expect(counts).toEqual({ background: 1, scene: 1, interaction: 0 });
    expect(model.revision()).toBe(revision);
    expect(view.geometryStats()).toEqual(stats);
  });

  it("REN-01 painter registered after mount repaints the scene layer", async () => {
    const model = buildModel([twoPortNode("a", 50, 50)]);
    const view = mountView(makeHost(300, 200), { model });
    cleanup(() => view.dispose());
    await frames();
    let calls = 0;
    view.painters.nodes.register("t", { paint: () => void calls++ });
    await frames();
    expect(calls).toBe(1);
  });
});
