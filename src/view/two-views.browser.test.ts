import { describe, expect, it } from "vitest";
import { buildModel, twoPortNode } from "../core/space/scene/scene-fixtures.js";
import { cleanupScope, frames, makeHost, pixelAt } from "./browser-support.js";
import { mountView } from "./mount-view.js";
import { boxNodePainter } from "./render/registries/fallback-painters.js";
import { createPainterRegistries } from "./render/registries/painters.js";

const cleanup = cleanupScope();

/** Registries whose node painter is a flat box, so pixel probes see only theme fills. */
function flatPainters() {
  const painters = createPainterRegistries();
  painters.nodes.replace("t", boxNodePainter);
  return painters;
}

describe("themes", () => {
  it("two themes on one model: each view paints with its own tokens", async () => {
    const model = buildModel([twoPortNode("a", 100, 75, { w: 60, h: 30 })]);
    const mount = (theme: Parameters<typeof mountView>[1]) => {
      const view = mountView(makeHost(200, 150), {
        model,
        painters: flatPainters(),
        ...theme,
      });
      cleanup(() => view.dispose());
      return view;
    };
    const a = mount({
      theme: { background: "#102030", nodeFill: "#ff0000" },
    });
    const b = mount({
      theme: { background: "#302010", nodeFill: "#00ff00" },
    });
    await frames();
    // (3,3) is between grid lines; (100,75) is the node centre.
    expect(pixelAt(a.canvases.background, 3, 3)).toEqual([16, 32, 48, 255]);
    expect(pixelAt(b.canvases.background, 3, 3)).toEqual([48, 32, 16, 255]);
    expect(pixelAt(a.canvases.scene, 100, 75)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(b.canvases.scene, 100, 75)).toEqual([0, 255, 0, 255]);
  });

  it("setTheme repaints background and scene without touching geometry", async () => {
    const model = buildModel([twoPortNode("a", 100, 75, { w: 60, h: 30 })]);
    const view = mountView(makeHost(200, 150), {
      model,
      painters: flatPainters(),
    });
    cleanup(() => view.dispose());
    await frames();
    const before = view.geometryStats();
    view.setTheme({ nodeFill: "#0000ff" });
    await frames();
    expect(pixelAt(view.canvases.scene, 100, 75)).toEqual([0, 0, 255, 255]);
    expect(view.geometryStats()).toEqual(before);
  });

  it("per-entity override changes one node only", async () => {
    const model = buildModel([
      twoPortNode("a", 50, 75, { w: 60, h: 30 }),
      twoPortNode("b", 150, 75, { w: 60, h: 30 }),
    ]);
    const view = mountView(makeHost(200, 150), {
      model,
      painters: flatPainters(),
      theme: {
        nodeFill: "#ff0000",
        entityOverrides: { b: { nodeFill: "#00ff00" } },
      },
    });
    cleanup(() => view.dispose());
    await frames();
    expect(pixelAt(view.canvases.scene, 50, 75)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(view.canvases.scene, 150, 75)).toEqual([0, 255, 0, 255]);
  });
});
