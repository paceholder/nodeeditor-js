import { describe, expect, it } from "vitest";
import {
  endTangents,
  isFinitePath,
  nearestPoint,
  type PathGeometry,
  pathBounds,
  pathDistance,
  pathPointAt,
} from "./path-geometry.js";
import { polylinePath } from "./polyline.js";
import { between, seededRandom } from "./test-utils.js";

const w = (x: number, y: number) => ({ x, y });
const pts = (...xy: number[]) =>
  Array.from({ length: xy.length / 2 }, (_, i) =>
    w(xy[2 * i] ?? 0, xy[2 * i + 1] ?? 0),
  );

const SHAPES: Record<string, ReturnType<typeof pts>> = {
  L: pts(0, 0, 100, 0, 100, 80),
  S: pts(0, 0, 100, 0, 100, 80, 200, 80),
  U: pts(0, 0, 120, 0, 120, 200, 100, 200),
};

function sampledDistance(path: PathGeometry, p: { x: number; y: number }) {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i <= 4000; i++) {
    const q = pathPointAt(path, i / 4000);
    best = Math.min(best, Math.hypot(q.x - p.x, q.y - p.y));
  }
  return best;
}

describe("polyline path geometry", () => {
  it("bounds of sharp and rounded L, S and U shapes contain every sampled point", () => {
    for (const [name, points] of Object.entries(SHAPES)) {
      for (const radius of [0, 10, 500]) {
        const path = polylinePath(points, radius);
        const b = pathBounds(path);
        for (let i = 0; i <= 1000; i++) {
          const q = pathPointAt(path, i / 1000);
          expect(q.x, name).toBeGreaterThanOrEqual(b.x - 1e-9);
          expect(q.x, name).toBeLessThanOrEqual(b.x + b.w + 1e-9);
          expect(q.y, name).toBeGreaterThanOrEqual(b.y - 1e-9);
          expect(q.y, name).toBeLessThanOrEqual(b.y + b.h + 1e-9);
        }
        expect(pathPointAt(path, 0)).toEqual(points[0]);
        expect(pathPointAt(path, 1)).toEqual(points[points.length - 1]);
      }
    }
  });

  it("nearest point agrees with dense sampling on straight parts and arcs", () => {
    const rnd = seededRandom(17);
    for (const points of Object.values(SHAPES)) {
      for (const radius of [0, 10, 30]) {
        const path = polylinePath(points, radius);
        for (let i = 0; i < 60; i++) {
          const p = w(between(rnd, -50, 250), between(rnd, -50, 250));
          const near = nearestPoint(path, p);
          const dense = sampledDistance(path, p);
          expect(near.distance).toBeLessThanOrEqual(dense + 1e-6);
          expect(near.distance).toBeGreaterThanOrEqual(dense - 0.05);
          expect(near.t).toBeGreaterThanOrEqual(0);
          expect(near.t).toBeLessThanOrEqual(1);
          expect(pathDistance(path, p)).toBeCloseTo(near.distance, 9);
          const at = pathPointAt(path, near.t);
          expect(
            Math.hypot(at.x - near.point.x, at.y - near.point.y),
          ).toBeLessThan(1e-6);
        }
      }
    }
  });

  it("Pick on a rounded corner: 3 units inside the sharp corner measures to the arc", () => {
    const sharp = polylinePath(SHAPES.L ?? [], 0);
    const round = polylinePath(SHAPES.L ?? [], 10);
    // The corner is (100, 0); the arc's centre is (90, 10) and its midpoint lies
    // 10 * (sqrt(2) - 1) ~ 4.14 units inside the corner along the diagonal.
    const p = w(100 - 3 / Math.SQRT2, 3 / Math.SQRT2);
    expect(pathDistance(sharp, p)).toBeCloseTo(3 / Math.SQRT2, 9);
    const toArc = 10 - Math.hypot(p.x - 90, p.y - 10);
    expect(pathDistance(round, p)).toBeCloseTo(Math.abs(toArc), 9);
    expect(pathDistance(round, p)).toBeCloseTo(10 * (Math.SQRT2 - 1) - 3, 9);
    const onArc = w(90 + 10 * Math.SQRT1_2, 10 - 10 * Math.SQRT1_2);
    expect(pathDistance(round, onArc)).toBeLessThan(1e-9);
  });

  it("Radius larger than a segment: the arc is reduced and the path stays continuous", () => {
    // Segments 100, 30 and 100: the middle segment allows at most 15 per corner.
    const path = polylinePath(pts(0, 0, 100, 0, 100, 30, 200, 30), 40);
    if (path.kind !== "polyline") throw new Error("kind");
    expect(path.radii).toEqual([15, 15]);
    let prev = pathPointAt(path, 0);
    for (let i = 1; i <= 2000; i++) {
      const q = pathPointAt(path, i / 2000);
      expect(Math.hypot(q.x - prev.x, q.y - prev.y)).toBeLessThan(0.2);
      prev = q;
    }
    // The two arcs meet exactly at the middle of the short segment.
    expect(pathDistance(path, w(100, 15))).toBeLessThan(1e-9);
  });

  it("sharp by default: no radii without a corner radius", () => {
    const path = polylinePath(SHAPES.S ?? []);
    expect(path).toEqual({
      kind: "polyline",
      p0: w(0, 0),
      via: [w(100, 0), w(100, 80)],
      p1: w(200, 80),
    });
  });

  it("a polyline with no via behaves like a line", () => {
    const poly = polylinePath(pts(0, 0, 100, 40), 10);
    const line: PathGeometry = { kind: "line", p0: w(0, 0), p1: w(100, 40) };
    expect(pathBounds(poly)).toEqual(pathBounds(line));
    expect(endTangents(poly)).toEqual(endTangents(line));
    for (const p of [w(50, 50), w(-10, 3), w(120, 40)])
      expect(pathDistance(poly, p)).toBeCloseTo(pathDistance(line, p), 12);
    expect(pathPointAt(poly, 0.5)).toEqual(pathPointAt(line, 0.5));
  });

  it("end tangents skip zero-length parts", () => {
    const path = polylinePath(pts(0, 0, 0, 0, 0, 50, 80, 50, 80, 50));
    expect(endTangents(path)).toEqual({ start: w(0, 1), end: w(1, 0) });
    const rounded = polylinePath(SHAPES.U ?? [], 8);
    expect(endTangents(rounded)).toEqual({ start: w(1, 0), end: w(-1, 0) });
  });

  it("a fully coincident polyline is finite with +x tangents", () => {
    const path = polylinePath(pts(5, 5, 5, 5, 5, 5), 10);
    expect(isFinitePath(path)).toBe(true);
    expect(pathBounds(path)).toEqual({ x: 5, y: 5, w: 0, h: 0 });
    expect(endTangents(path)).toEqual({ start: w(1, 0), end: w(1, 0) });
    expect(pathDistance(path, w(8, 9))).toBe(5);
    expect(nearestPoint(path, w(8, 9)).t).toBe(0);
    expect(pathPointAt(path, 0.5)).toEqual(w(5, 5));
  });

  it("non-finite vertices or radii make the path non-finite", () => {
    expect(isFinitePath(polylinePath(pts(0, 0, Number.NaN, 0, 5, 5)))).toBe(
      false,
    );
    expect(
      isFinitePath({
        kind: "polyline",
        p0: w(0, 0),
        via: [w(10, 0)],
        p1: w(10, 10),
        radii: [Number.POSITIVE_INFINITY],
      }),
    ).toBe(false);
  });
});
