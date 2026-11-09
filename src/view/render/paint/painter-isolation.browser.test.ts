import { describe, expect, it, vi } from "vitest";
import { createGraphModel } from "../../../core/index.js";
import {
  submitChunked,
  twoPortNode,
} from "../../../core/space/scene/scene-fixtures.js";
import {
  cleanupScope,
  frames,
  makeHost,
  pixelAt,
} from "../../browser-support.js";
import { mountView } from "../../mount-view.js";
import type { NodePainter } from "../registries/painter-types.js";
import { createPainterRegistries } from "../registries/painters.js";

const cleanup = cleanupScope();
const GREEN: NodePainter = {
  paint(ctx, { bounds }) {
    ctx.fillStyle = "#00ff00";
    ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
  },
};

/** Two 40x20 nodes, far apart: `a` at world (50, 50), `b` at world (300, 200). */
function setup(painter: NodePainter) {
  const model = createGraphModel();
  submitChunked(
    model,
    [twoPortNode("a", 50, 50, { type: "clip" }), twoPortNode("b", 300, 200)],
    [],
  );
  const painters = createPainterRegistries();
  painters.nodes.replace("clip", painter);
  painters.nodes.replace("t", GREEN);
  const view = mountView(makeHost(400, 300), {
    model,
    painters,
    initialViewport: { zoom: 1, panX: 0, panY: 0 },
  });
  cleanup(() => view.dispose());
  return view;
}

describe("painter failures stay contained", () => {
  it("a node painter that clips to its node and throws once leaves later nodes and frames unclipped", async () => {
    let throws = 1;
    const errors: unknown[] = [];
    const view = setup({
      paint(ctx, { bounds }) {
        ctx.beginPath();
        ctx.rect(bounds.x, bounds.y, bounds.w, bounds.h);
        ctx.clip();
        ctx.globalAlpha = 0.1;
        if (throws-- > 0) throw new Error("painter bug");
      },
    });
    view.on("paint-error", (e) => void errors.push(e));
    await frames();
    // Node b is painted in the frame where a threw...
    expect(pixelAt(view.canvases.scene, 300, 200)[1]).toBe(255);
    // ...and in later frames.
    view.invalidate("scene");
    await frames();
    expect(pixelAt(view.canvases.scene, 300, 200)[1]).toBe(255);
    expect(errors).toHaveLength(1);
  });

  it("errors are reported once per layer per frame with the layer name", async () => {
    const errors: Array<{ layer: string; error: unknown }> = [];
    const view = setup({
      paint() {
        throw new Error("always");
      },
    });
    // A second throwing node in the same frame.
    view.painters.nodes.replace("t", {
      paint() {
        throw new Error("also");
      },
    });
    view.on("paint-error", (e) => void errors.push(e));
    await frames();
    expect(errors.length).toBeGreaterThan(0);
    const first = errors[0];
    expect(first?.layer).toBe("scene");
    expect((first?.error as Error | undefined)?.message).toBe("always");
    // One report per painted frame, never one per node.
    const before = errors.length;
    view.invalidate("scene");
    await frames();
    expect(errors.length - before).toBe(1);
  });

  it("an interaction painter that throws does not stop the others", async () => {
    const errors: unknown[] = [];
    const view = setup(GREEN);
    view.on("paint-error", (e) => void errors.push(e));
    view.interaction.add({
      paint(ctx) {
        ctx.beginPath();
        ctx.rect(0, 0, 1, 1);
        ctx.clip();
        throw new Error("overlay bug");
      },
    });
    view.interaction.add({
      paint(ctx) {
        ctx.fillStyle = "#0000ff";
        ctx.fillRect(100, 100, 20, 20);
      },
    });
    await frames();
    expect(pixelAt(view.canvases.interaction, 110, 110)[2]).toBe(255);
    expect(errors).toHaveLength(1);
  });

  it("without a listener the error is rethrown asynchronously", async () => {
    // Capture the deferred rethrow instead of letting it fail the test run.
    const deferred: Array<() => void> = [];
    const spy = vi
      .spyOn(window, "queueMicrotask")
      .mockImplementation((cb) => void deferred.push(cb));
    cleanup(() => spy.mockRestore());
    const view = setup({
      paint() {
        throw new Error("unheard");
      },
    });
    await frames();
    spy.mockRestore();
    expect(pixelAt(view.canvases.scene, 300, 200)[1]).toBe(255);
    const thrown = deferred.map((cb) => {
      try {
        cb();
        return undefined;
      } catch (error) {
        return (error as Error).message;
      }
    });
    expect(thrown).toContain("unheard");
  });
});
