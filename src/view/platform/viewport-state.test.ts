import { describe, expect, it } from "vitest";
import { MAX_ZOOM, MIN_ZOOM } from "../../core/index.js";
import { createViewportState } from "./viewport-state.js";
import { resolveZoomLimits } from "./zoom-limits.js";

const metrics = {
  clientRect: () => ({ left: 0, top: 0 }) as DOMRect,
  isMeasurable: () => true,
};
const make = (min: number, max: number) =>
  createViewportState(
    metrics,
    () => {},
    { zoom: 1, panX: 0, panY: 0 },
    resolveZoomLimits({ min, max }),
  );

describe("zoom limits", () => {
  it("zoomAt stays inside the limits at both ends", () => {
    const state = make(0.1, 2);
    state.zoomAt({ x: 0, y: 0 }, 1000);
    expect(state.get().zoom).toBe(2);
    state.zoomAt({ x: 0, y: 0 }, 1e-6);
    expect(state.get().zoom).toBe(0.1);
  });

  it("set clamps the zoom into the limits", () => {
    const state = make(0.5, 4);
    state.set({ zoom: 100, panX: 3, panY: 4 });
    expect(state.get()).toEqual({ zoom: 4, panX: 3, panY: 4 });
    state.set({ zoom: 0.01, panX: 0, panY: 0 });
    expect(state.get().zoom).toBe(0.5);
  });

  it("limits narrow the absolute bounds and never widen them", () => {
    expect(resolveZoomLimits()).toEqual({ min: MIN_ZOOM, max: MAX_ZOOM });
    expect(resolveZoomLimits({ min: 1e-9, max: 1e9 })).toEqual({
      min: MIN_ZOOM,
      max: MAX_ZOOM,
    });
    expect(() => resolveZoomLimits({ min: 2, max: 1 })).toThrow(RangeError);
    expect(() => resolveZoomLimits({ min: Number.NaN })).toThrow(RangeError);
  });
});
