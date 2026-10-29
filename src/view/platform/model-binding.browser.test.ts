import { describe, expect, it } from "vitest";
import { nodeId } from "../../core/index.js";
import {
  buildModel,
  twoPortNode,
} from "../../core/space/scene/scene-fixtures.js";
import { cleanupScope, frames, makeHost, pixelAt } from "../browser-support.js";
import { mountView } from "../mount-view.js";
import { boxNodePainter } from "../render/registries/fallback-painters.js";
import { createPainterRegistries } from "../render/registries/painters.js";

const cleanup = cleanupScope();

function flatPainters() {
  const painters = createPainterRegistries();
  painters.nodes.replace("t", boxNodePainter);
  return painters;
}

function setup() {
  const model = buildModel([twoPortNode("a", 100, 75, { w: 60, h: 30 })]);
  const view = mountView(makeHost(220, 150), {
    model,
    painters: flatPainters(),
    theme: { nodeFill: "#ff0000" },
  });
  cleanup(() => view.dispose());
  return { model, view };
}

describe("model binding in the view", () => {
  it("REN-04 theme change: repaints without any geometry work", async () => {
    const { view } = setup();
    await frames();
    const before = view.geometryStats();
    view.setTheme({ nodeFill: "#0000ff" });
    await frames();
    expect(pixelAt(view.canvases.scene, 100, 75)).toEqual([0, 0, 255, 255]);
    expect(view.geometryStats()).toEqual(before);
  });

  it("REN-04 status decoration update: badge appears, geometry is not recomputed", async () => {
    const { model, view } = setup();
    await frames();
    const before = view.geometryStats();
    const frameCount = view.renderStats().framesPainted;
    model.updateNode(nodeId("a"), { status: "error" });
    await frames();
    expect(view.renderStats().framesPainted).toBe(frameCount + 1);
    expect(view.geometryStats()).toEqual(before);
    // An error badge is drawn in the theme's error colour somewhere on the node.
    let found = false;
    for (let x = 70; x <= 130 && !found; x += 2) {
      for (let y = 60; y <= 90 && !found; y += 2) {
        const [r, g, b] = pixelAt(view.canvases.scene, x, y);
        found = r === 0xef && g === 0x53 && b === 0x50;
      }
    }
    expect(found).toBe(true);
  });

  it("MOD-10 edit visible in both views: one edit repaints each view", async () => {
    const model = buildModel([twoPortNode("a", 100, 75, { w: 60, h: 30 })]);
    const mount = () => {
      const view = mountView(makeHost(220, 150), {
        model,
        painters: flatPainters(),
      });
      cleanup(() => view.dispose());
      return view;
    };
    const a = mount();
    const b = mount();
    await frames();
    for (const v of [a, b]) {
      expect(pixelAt(v.canvases.scene, 80, 75)[3]).toBe(255);
      expect(pixelAt(v.canvases.scene, 170, 75)[3]).toBe(0);
    }
    model.moveNodes([{ node: nodeId("a"), position: { x: 150, y: 75 } }]);
    await frames();
    for (const v of [a, b]) {
      expect(pixelAt(v.canvases.scene, 80, 75)[3]).toBe(0);
      expect(pixelAt(v.canvases.scene, 170, 75)[3]).toBe(255);
    }
  });

  it("MOD-02 dispose stops listening to the model", async () => {
    const { model, view } = setup();
    await frames();
    const painted = view.renderStats().framesPainted;
    view.dispose();
    model.moveNodes([{ node: nodeId("a"), position: { x: 150, y: 75 } }]);
    await frames();
    expect(view.renderStats().framesPainted).toBe(painted);
  });
});
