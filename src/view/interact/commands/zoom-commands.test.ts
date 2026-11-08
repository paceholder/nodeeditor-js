import { describe, expect, it } from "vitest";
import { type Viewport, viewportToWorld } from "../../../core/index.js";
import { createZoomCommands } from "./zoom-commands.js";

function setup(zoom = 1, limits = { min: 0.25, max: 4 }) {
  let viewport: Viewport = { zoom, panX: 10, panY: -20 };
  const zoomCommands = createZoomCommands({
    viewport: {
      get: () => viewport,
      set: (v) => {
        viewport = v;
        return { ok: true, value: v };
      },
    },
    size: () => ({ width: 400, height: 200 }),
    limits: () => limits,
  });
  return {
    zoomCommands,
    viewport: () => viewport,
    setLimits: (l: typeof limits) => (limits = l),
  };
}

describe("zoom commands", () => {
  it("zooming about the centre keeps the world point under the centre fixed", () => {
    const { zoomCommands, viewport } = setup(1);
    const before = viewportToWorld(viewport(), { x: 200, y: 100 });
    expect(zoomCommands.zoomBy(2)).toEqual({
      ok: true,
      value: { changed: true },
    });
    expect(viewport().zoom).toBe(2);
    const after = viewportToWorld(viewport(), { x: 200, y: 100 });
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
  });

  it("a step stops at the limit and is then unavailable", () => {
    const { zoomCommands, viewport } = setup(3.5);
    expect(zoomCommands.canZoomBy(1.25)).toBe(true);
    zoomCommands.zoomBy(1.25);
    expect(viewport().zoom).toBe(4);
    expect(zoomCommands.canZoomBy(1.25)).toBe(false);
    expect(zoomCommands.zoomBy(1.25)).toEqual({
      ok: true,
      value: { changed: false },
    });
    expect(zoomCommands.canZoomBy(1 / 1.25)).toBe(true);
  });

  it("changed limits apply to the next step", () => {
    const { zoomCommands, viewport, setLimits } = setup(1);
    setLimits({ min: 0.5, max: 1 });
    expect(zoomCommands.canZoomBy(2)).toBe(false);
    zoomCommands.zoomBy(0.1);
    expect(viewport().zoom).toBe(0.5);
  });

  it("a non-positive or non-finite factor is a result, not a throw", () => {
    const { zoomCommands } = setup(1);
    for (const factor of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(zoomCommands.zoomBy(factor).ok).toBe(false);
      expect(zoomCommands.canZoomBy(factor)).toBe(false);
    }
  });
});
