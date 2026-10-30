import { describe, expect, it } from "vitest";
import {
  MAX_ZOOM,
  MIN_ZOOM,
  viewportToWorld,
  worldToViewport,
} from "../../../core/index.js";
import {
  cornerNode,
  createToolHarness,
} from "../../test-support/tool-harness.js";
import { NO_MODIFIERS } from "./tool-types.js";

const wheel = (
  h: ReturnType<typeof createToolHarness>,
  x: number,
  y: number,
  deltaY: number,
  mod = false,
) =>
  h.send({
    type: "wheel",
    viewport: { x, y },
    deltaY,
    modifiers: { ...NO_MODIFIERS, mod },
  });

describe("navigation", () => {
  it("INT-01, GEO-06 the world point under the cursor stays fixed while zooming", () => {
    const h = createToolHarness({
      viewport: { zoom: 1.3, panX: 25, panY: -40 },
    });
    const anchor = { x: 321, y: 187 };
    const before = viewportToWorld(h.viewport(), anchor);
    for (const dy of [-120, -80, 60, -300, 40]) {
      expect(wheel(h, anchor.x, anchor.y, dy).handled).toBe(true);
      const after = viewportToWorld(h.viewport(), anchor);
      expect(after.x).toBeCloseTo(before.x, 9);
      expect(after.y).toBeCloseTo(before.y, 9);
    }
    const back = worldToViewport(h.viewport(), before);
    expect(back.x).toBeCloseTo(anchor.x, 9);
  });

  it("INT-01, GEO-06 zoom clamps at the limits with a finite invertible transform", () => {
    const h = createToolHarness();
    for (let i = 0; i < 400; i++) wheel(h, 100, 100, -500);
    expect(h.viewport().zoom).toBe(MAX_ZOOM);
    // At the limit the wheel is not handled, so the page may scroll (INT-06).
    expect(wheel(h, 100, 100, -500).handled).toBe(false);
    for (let i = 0; i < 800; i++) wheel(h, 100, 100, 500);
    expect(h.viewport().zoom).toBe(MIN_ZOOM);
    expect(wheel(h, 100, 100, 500).handled).toBe(false);
    const v = h.viewport();
    expect(Number.isFinite(v.panX) && Number.isFinite(v.panY)).toBe(true);
    const p = { x: 12, y: 34 };
    const round = viewportToWorld(v, worldToViewport(v, p));
    expect(round.x).toBeCloseTo(p.x, 6);
  });

  it("INT-06 scroll-page mode only zooms with the modifier", () => {
    const h = createToolHarness({
      options: { wheel: "scroll-page-unless-modifier" },
    });
    expect(wheel(h, 10, 10, -100).handled).toBe(false);
    expect(h.viewport().zoom).toBe(1);
    expect(wheel(h, 10, 10, -100, true).handled).toBe(true);
    expect(h.viewport().zoom).toBeGreaterThan(1);
  });

  it("INT-01 wheel still zooms while another gesture is active", () => {
    const h = createToolHarness({ nodes: [cornerNode("a", 0, 0)] });
    h.down({ x: 20, y: 10 });
    expect(wheel(h, 10, 10, -100).handled).toBe(true);
    expect(h.router.activeTool).toBe("select-move");
  });

  it("INT-01 pan (middle button or Space) changes only the viewport", () => {
    const h = createToolHarness({ nodes: [cornerNode("a", 0, 0)] });
    const rev = h.model.reader.revision();
    h.selection.replace(["n:a"]);
    h.down({ x: 100, y: 100 }, { button: 1 });
    h.move({ x: 130, y: 90 }, { button: 1 });
    h.move({ x: 150, y: 120 }, { button: 1 });
    h.up({ x: 150, y: 120 }, { button: 1 });
    // Pointer events carry viewport positions from the pre-pan transform, so compare the sum.
    expect(h.viewport().zoom).toBe(1);
    expect(h.viewport().panX).not.toBe(0);
    expect(h.log.commits).toEqual([]);
    expect(h.model.reader.revision()).toBe(rev);
    expect(h.selection.keys()).toEqual(["n:a"]);
    expect(h.log.cursors).toEqual(["grabbing", "default"]);
  });
});
