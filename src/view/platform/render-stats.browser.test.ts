import { describe, expect, it } from "vitest";
import { createGeometryScene } from "../../core/index.js";
import {
  buildModel,
  type ConnSpec,
  type NodeSpec,
  twoPortNode,
} from "../../core/space/scene/scene-fixtures.js";
import { cleanupScope, frames, makeHost } from "../browser-support.js";
import { mountView } from "../mount-view.js";

const cleanup = cleanupScope();

describe("render stats", () => {
  it("render stats: counts match a culled fixture, frames counted, idle is flat", async () => {
    // 20 x 20 grid, 100 apart; each row is chained by connections.
    const nodes: NodeSpec[] = [];
    const conns: ConnSpec[] = [];
    for (let j = 0; j < 20; j++) {
      for (let i = 0; i < 20; i++) {
        nodes.push(twoPortNode(`n${j}_${i}`, i * 100, j * 100));
        if (i > 0) {
          conns.push([
            `c${j}_${i}`,
            `n${j}_${i - 1}`,
            `n${j}_${i - 1}R`,
            `n${j}_${i}`,
            `n${j}_${i}L`,
          ]);
        }
      }
    }
    const model = buildModel(nodes, conns);
    const independent = createGeometryScene(model);
    cleanup(() => independent.dispose());
    const view = mountView(makeHost(400, 300), {
      model,
      initialViewport: { zoom: 1, panX: -500, panY: -500 },
    });
    cleanup(() => view.dispose());
    await frames(4);

    const visible = independent.queryRect(
      { x: 500, y: 500, w: 400, h: 300 },
      "painted",
    );
    const nodesIn = visible.filter((i) => i.kind === "node").length;
    const pathsIn = visible.filter((i) => i.kind === "connection").length;
    const s = view.renderStats();
    expect(nodesIn).toBeGreaterThan(0);
    expect(s.nodes.painted).toBe(nodesIn);
    expect(s.nodes.painted + s.nodes.culled).toBe(400);
    expect(s.paths.painted).toBe(pathsIn);
    expect(s.paths.painted + s.paths.culled).toBe(380);
    expect(s.layers.scene.lastPaintMs).toBeGreaterThanOrEqual(0);
    expect(s.layers.background.lastPaintMs).toBeGreaterThanOrEqual(0);

    // Two pans in one frame are one painted frame.
    const f0 = s.framesPainted;
    view.viewport.panBy(10, 0);
    view.viewport.panBy(10, 0);
    await frames(3);
    expect(view.renderStats().framesPainted).toBe(f0 + 1);
    // Idle: nothing changes.
    await frames(8);
    expect(view.renderStats().framesPainted).toBe(f0 + 1);
    // A separate frame later counts again.
    view.interaction.invalidate();
    await frames(3);
    expect(view.renderStats().framesPainted).toBe(f0 + 2);
  });

  it("lastPaintedInputSeq reports the input tagged before the painting frame", async () => {
    const model = buildModel([twoPortNode("a", 50, 50)]);
    const view = mountView(makeHost(300, 200), { model });
    cleanup(() => view.dispose());
    await frames(4);
    expect(view.renderStats().lastPaintedInputSeq).toBe(0);
    view.noteInput(7);
    // Tagged but nothing is dirty yet: no frame, so nothing reported.
    await frames(3);
    expect(view.renderStats().lastPaintedInputSeq).toBe(0);
    view.interaction.invalidate();
    await frames(3);
    expect(view.renderStats().lastPaintedInputSeq).toBe(7);
  });
});
