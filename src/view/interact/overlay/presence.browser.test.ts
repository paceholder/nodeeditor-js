import { describe, expect, it, vi } from "vitest";
import { nodeId } from "../../../core/index.js";
import {
  buildModel,
  twoPortNode,
} from "../../../core/space/scene/scene-fixtures.js";
import {
  cleanupScope,
  frames,
  makeHost,
  pixelAt,
} from "../../browser-support.js";
import { mountView } from "../../mount-view.js";

const cleanup = cleanupScope();

describe("presence", () => {
  it("remote cursor: drawn at its world position after pan and zoom, no model events", async () => {
    const model = buildModel([twoPortNode("a", 300, 300)]);
    const changes = vi.fn();
    model.on("change", changes);
    model.on("reset", changes);
    const revision = model.revision();
    const view = mountView(makeHost(300, 200));
    const modelView = mountView(makeHost(300, 200), { model });
    cleanup(() => view.dispose());
    cleanup(() => modelView.dispose());
    await frames();

    view.setPresence([
      { id: "r1", kind: "cursor", at: { x: 100, y: 50 }, color: "#ff0000" },
    ]);
    await frames();
    const layer = view.canvases.interaction;
    // The arrow's body lies a few pixels right of and below its tip.
    expect(pixelAt(layer, 103, 53)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(layer, 90, 40)[3]).toBe(0);

    view.viewport.set({ zoom: 2, panX: 20, panY: 10 });
    await frames();
    // World (100, 50) is now CSS (220, 110); the glyph keeps its size on screen.
    expect(pixelAt(layer, 223, 113)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(layer, 103, 53)[3]).toBe(0);

    view.setPresence([]);
    await frames();
    expect(pixelAt(layer, 223, 113)[3]).toBe(0);
    expect(changes).not.toHaveBeenCalled();
    expect(model.revision()).toBe(revision);
  });

  it("selection presence outlines the node and repaints only the interaction layer", async () => {
    const model = buildModel([twoPortNode("a", 100, 75, { w: 60, h: 30 })]);
    const view = mountView(makeHost(300, 200), { model });
    cleanup(() => view.dispose());
    await frames();
    const scenePaints = vi.spyOn(view.canvases.scene, "getContext");
    view.setPresence([
      { id: "r1", kind: "selection", nodes: [nodeId("a")], color: "#00ff00" },
    ]);
    await frames();
    // The dashed outline's left edge is at x = 70; scan the column for painted pixels.
    let hits = 0;
    for (let y = 61; y <= 89; y++) {
      if (pixelAt(view.canvases.interaction, 70, y)[3] > 0) hits++;
    }
    expect(hits).toBeGreaterThan(5);
    expect(scenePaints).not.toHaveBeenCalled();
  });
});
