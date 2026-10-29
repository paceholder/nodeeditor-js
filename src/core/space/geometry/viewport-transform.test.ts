import { describe, expect, it } from "vitest";
import { applyPoint } from "./affine.js";
import { MAX_ZOOM, MIN_ZOOM } from "./limits.js";
import { between, seededRandom } from "./test-utils.js";
import {
  createViewport,
  deviceMatrix,
  deviceToViewport,
  viewportMatrix,
  viewportToDevice,
  viewportToWorld,
  worldToViewport,
  zoomAt,
} from "./viewport-transform.js";

describe("viewport and device conversions", () => {
  it("round trip between world and viewport at random zoom and pan", () => {
    const rnd = seededRandom(3);
    for (let i = 0; i < 500; i++) {
      const v = createViewport(
        10 ** between(rnd, -3, 3),
        between(rnd, -5000, 5000),
        between(rnd, -5000, 5000),
      );
      if (!v.ok) throw new Error("setup");
      const p = { x: between(rnd, -1e6, 1e6), y: between(rnd, -1e6, 1e6) };
      const back = viewportToWorld(v.value, worldToViewport(v.value, p));
      expect(back.x).toBeCloseTo(p.x, 4);
      expect(back.y).toBeCloseTo(p.y, 4);
    }
  });

  it("DPR 2 doubles coordinates and the inverse restores them", () => {
    const p = { x: 10.5, y: 20 };
    expect(viewportToDevice(2, p)).toEqual({ x: 21, y: 40 });
    expect(deviceToViewport(2, viewportToDevice(2, p))).toEqual(p);
    const m = deviceMatrix(2);
    expect(m.ok && applyPoint(m.value, p)).toEqual({ x: 21, y: 40 });
    expect(deviceMatrix(0).ok).toBe(false);
    expect(deviceMatrix(Number.NaN).ok).toBe(false);
  });

  it("the matrix form agrees with the point functions", () => {
    const v = createViewport(2.5, 30, -10);
    if (!v.ok) throw new Error("setup");
    const p = { x: 7, y: 9 };
    expect(applyPoint(viewportMatrix(v.value), p)).toEqual(
      worldToViewport(v.value, p),
    );
  });

  it("zoom out of range is clamped and non-finite is rejected", () => {
    const zero = createViewport(0, 0, 0);
    expect(zero.ok && zero.value.zoom).toBe(MIN_ZOOM);
    const huge = createViewport(1e9, 0, 0);
    expect(huge.ok && huge.value.zoom).toBe(MAX_ZOOM);
    expect(createViewport(Number.NaN, 0, 0).ok).toBe(false);
    expect(createViewport(1, Number.POSITIVE_INFINITY, 0).ok).toBe(false);
    // The clamped transform stays invertible.
    if (zero.ok) {
      const p = viewportToWorld(
        zero.value,
        worldToViewport(zero.value, { x: 5, y: 5 }),
      );
      expect(Number.isFinite(p.x)).toBe(true);
    }
  });

  it("cursor-anchored zoom keeps the world point under the cursor", () => {
    const v = createViewport(1, 40, 25);
    if (!v.ok) throw new Error("setup");
    const anchor = { x: 300, y: 200 };
    const before = viewportToWorld(v.value, anchor);
    const z = zoomAt(v.value, 4, anchor);
    expect(z.ok).toBe(true);
    if (z.ok) {
      const after = viewportToWorld(z.value, anchor);
      expect(after.x).toBeCloseTo(before.x, 9);
      expect(after.y).toBeCloseTo(before.y, 9);
      expect(z.value.zoom).toBe(4);
    }
  });
});
