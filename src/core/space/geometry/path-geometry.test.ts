import { describe, expect, it } from "vitest";
import {
  endTangents,
  nearestPoint,
  type PathGeometry,
  pathBounds,
  pathDistance,
  pathPointAt,
} from "./path-geometry.js";
import { between, seededRandom } from "./test-utils.js";

const w = (x: number, y: number) => ({ x, y });
const cubic = (a: number[]): PathGeometry => ({
  kind: "cubic",
  p0: w(a[0] ?? 0, a[1] ?? 0),
  c1: w(a[2] ?? 0, a[3] ?? 0),
  c2: w(a[4] ?? 0, a[5] ?? 0),
  p1: w(a[6] ?? 0, a[7] ?? 0),
});

function sampled(path: PathGeometry, p: { x: number; y: number }) {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i <= 4000; i++) {
    const q = pathPointAt(path, i / 4000);
    best = Math.min(best, Math.hypot(q.x - p.x, q.y - p.y));
  }
  return best;
}

const CURVES: Record<string, PathGeometry> = {
  sCurve: cubic([0, 0, 100, 0, -100, 100, 0, 100]),
  loop: cubic([0, 0, 200, 100, -100, 100, 100, 0]),
  straightCubic: cubic([0, 0, 10, 0, 20, 0, 30, 0]),
  allCoincident: cubic([5, 5, 5, 5, 5, 5, 5, 5]),
  coincidentEnds: cubic([0, 0, 50, 0, 50, 50, 0, 0]),
  line: { kind: "line", p0: w(0, 0), p1: w(100, 40) },
  zeroLine: { kind: "line", p0: w(7, 7), p1: w(7, 7) },
};

describe("path geometry", () => {
  it("nearest point agrees with dense sampling, with no NaN", () => {
    const rnd = seededRandom(5);
    for (const [name, path] of Object.entries(CURVES)) {
      for (let i = 0; i < 60; i++) {
        const p = w(between(rnd, -150, 250), between(rnd, -150, 250));
        const near = nearestPoint(path, p);
        expect(Number.isFinite(near.distance), name).toBe(true);
        expect(near.t).toBeGreaterThanOrEqual(0);
        expect(near.t).toBeLessThanOrEqual(1);
        const dense = sampled(path, p);
        expect(near.distance, name).toBeLessThanOrEqual(dense + 1e-6);
        expect(near.distance, name).toBeGreaterThanOrEqual(dense - 0.05);
        expect(pathDistance(path, p)).toBeCloseTo(near.distance, 9);
      }
    }
  });

  it("cubic bounds are exact: they contain all samples and touch the extrema", () => {
    for (const path of Object.values(CURVES)) {
      const b = pathBounds(path);
      let minX = Number.POSITIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      for (let i = 0; i <= 4000; i++) {
        const q = pathPointAt(path, i / 4000);
        expect(q.x).toBeGreaterThanOrEqual(b.x - 1e-9);
        expect(q.x).toBeLessThanOrEqual(b.x + b.w + 1e-9);
        expect(q.y).toBeGreaterThanOrEqual(b.y - 1e-9);
        expect(q.y).toBeLessThanOrEqual(b.y + b.h + 1e-9);
        minX = Math.min(minX, q.x);
        maxY = Math.max(maxY, q.y);
      }
      expect(b.x).toBeCloseTo(minX, 3);
      expect(b.y + b.h).toBeCloseTo(maxY, 3);
    }
  });

  it("end tangents point along the direction of travel", () => {
    const t = endTangents(CURVES.sCurve as PathGeometry);
    expect(t.start).toEqual({ x: 1, y: 0 });
    expect(t.end.x).toBeCloseTo(1, 9);
    const l = endTangents(CURVES.line as PathGeometry);
    expect(Math.hypot(l.start.x, l.start.y)).toBeCloseTo(1, 9);
  });

  it("coincident anchors: bounds, distance and tangents are finite", () => {
    for (const path of [
      CURVES.allCoincident,
      CURVES.zeroLine,
      CURVES.coincidentEnds,
    ]) {
      const p = path as PathGeometry;
      const b = pathBounds(p);
      expect(Object.values(b).every(Number.isFinite)).toBe(true);
      const t = endTangents(p);
      expect(Object.values(t.start).every(Number.isFinite)).toBe(true);
      expect(Object.values(t.end).every(Number.isFinite)).toBe(true);
    }
    expect(pathDistance(CURVES.zeroLine as PathGeometry, w(10, 11))).toBe(5);
    expect(pathDistance(CURVES.allCoincident as PathGeometry, w(8, 9))).toBe(5);
  });
});
