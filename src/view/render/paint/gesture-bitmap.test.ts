import { describe, expect, it } from "vitest";
import {
  copyTransform,
  DEFAULT_GESTURE_BITMAP,
  uncoveredFraction,
  zoomRatioWithin,
} from "./gesture-bitmap.js";

describe("LAY-05 gesture bitmap staleness limit", () => {
  it("LAY-05 copy transform maps stored device points to the new viewport", () => {
    const from = { zoom: 0.5, panX: 10, panY: -20 };
    const to = { zoom: 0.6, panX: -5, panY: 7 };
    const t = copyTransform(from, to, 2);
    // A world point through both viewports at DPR 2.
    const w = { x: 123, y: -45 };
    const before = { x: 2 * (w.x * 0.5 + 10), y: 2 * (w.y * 0.5 - 20) };
    const after = { x: 2 * (w.x * 0.6 - 5), y: 2 * (w.y * 0.6 + 7) };
    expect(t.k).toBeCloseTo(1.2, 12);
    expect(t.k * before.x + t.e).toBeCloseTo(after.x, 9);
    expect(t.k * before.y + t.f).toBeCloseTo(after.y, 9);
  });

  it("LAY-05 the zoom ratio bound applies both ways", () => {
    const max = DEFAULT_GESTURE_BITMAP.maxZoomRatio;
    expect(zoomRatioWithin(1, max)).toBe(true);
    expect(zoomRatioWithin(1.25, max)).toBe(true);
    expect(zoomRatioWithin(0.8, max)).toBe(true);
    expect(zoomRatioWithin(1.2501, max)).toBe(false);
    expect(zoomRatioWithin(0.7999, max)).toBe(false);
  });

  it("LAY-05 uncovered fraction of pans, zooms and copies off view", () => {
    const at = (k: number, e: number, f: number) =>
      uncoveredFraction({ k, e, f }, 600, 400);
    expect(at(1, 0, 0)).toBe(0);
    expect(at(1, 150, 0)).toBeCloseTo(0.25, 12);
    expect(at(1, -150, 0)).toBeCloseTo(0.25, 12);
    expect(at(1, 0, -100)).toBeCloseTo(0.25, 12);
    // Diagonal: covered 450 x 300 of 600 x 400.
    expect(at(1, 150, 100)).toBeCloseTo(1 - 0.5625, 12);
    // Zoom in about the centre covers everything; zoom out leaves a frame.
    expect(at(1.25, -75, -50)).toBe(0);
    expect(at(0.8, 60, 40)).toBeCloseTo(1 - 0.64, 12);
    expect(at(1, 700, 0)).toBe(1);
    expect(uncoveredFraction({ k: 1, e: 0, f: 0 }, 0, 0)).toBe(0);
  });
});
