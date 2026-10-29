import { describe, expect, it } from "vitest";
import {
  ellipseShape,
  polygonShape,
  rectShape,
  roundRectShape,
  type Shape,
  shapeBounds,
  shapeContains,
  shapeDistance,
} from "./shapes.js";
import { rect } from "./spaces.js";
import { between, seededRandom } from "./test-utils.js";

function diamond(): Shape {
  const r = polygonShape([
    { x: 0, y: -20 },
    { x: 10, y: 0 },
    { x: 0, y: 20 },
    { x: -10, y: 0 },
  ]);
  if (!r.ok) throw new Error("setup");
  return r.value;
}

describe("GEO-04 hit shapes", () => {
  it("GEO-04 diamond outside shape: bounding-box corner is not hit", () => {
    const d = diamond();
    const b = shapeBounds(d);
    const corner = { x: b.x + 1, y: b.y + 1 };
    expect(corner.x).toBeGreaterThan(-10);
    expect(shapeContains(d, corner)).toBe(false);
    expect(shapeContains(d, { x: 0, y: 0 })).toBe(true);
    expect(shapeContains(d, { x: 10, y: 0 })).toBe(true);
    expect(shapeDistance(d, corner)).toBeGreaterThan(0);
  });

  it("GEO-04 rect and round rect distances", () => {
    const r = rectShape(rect(-10, -5, 20, 10));
    expect(shapeDistance(r, { x: 0, y: 0 })).toBe(0);
    expect(shapeDistance(r, { x: 13, y: 9 })).toBe(5);
    const rr = roundRectShape(rect(-10, -10, 20, 20), 5);
    expect(shapeContains(rr, { x: 9.9, y: 9.9 })).toBe(false);
    expect(shapeContains(rr, { x: 8, y: 8 })).toBe(true);
    // Straight edge: 5 units right of the right edge. Rounded corner: center (5,5), r 5.
    expect(shapeDistance(rr, { x: 15, y: 5 })).toBeCloseTo(5, 9);
    expect(shapeDistance(rr, { x: 5 + 8, y: 5 + 6 })).toBeCloseTo(10 - 5, 9);
  });

  it("GEO-04 ellipse distance matches dense boundary sampling", () => {
    const e = ellipseShape(rect(-30, -10, 60, 20));
    const rnd = seededRandom(11);
    for (let i = 0; i < 100; i++) {
      const p = { x: between(rnd, -60, 60), y: between(rnd, -40, 40) };
      let best = Number.POSITIVE_INFINITY;
      for (let k = 0; k < 4000; k++) {
        const a = (k / 4000) * Math.PI * 2;
        best = Math.min(
          best,
          Math.hypot(p.x - 30 * Math.cos(a), p.y - 10 * Math.sin(a)),
        );
      }
      const d = shapeDistance(e, p);
      if (shapeContains(e, p)) expect(d).toBe(0);
      else expect(d).toBeCloseTo(best, 2);
    }
  });

  it("GEO-06 degenerate shapes stay finite and bad polygons are rejected", () => {
    const zero = ellipseShape(rect(0, 0, 0, 0));
    expect(Number.isFinite(shapeDistance(zero, { x: 3, y: 4 }))).toBe(true);
    expect(shapeDistance(zero, { x: 3, y: 4 })).toBe(5);
    expect(
      polygonShape([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ]).ok,
    ).toBe(false);
    expect(
      polygonShape([
        { x: 0, y: 0 },
        { x: 1, y: Number.NaN },
        { x: 2, y: 0 },
      ]).ok,
    ).toBe(false);
    expect(
      shapeContains(rectShape(rect(0, 0, 1, 1)), { x: Number.NaN, y: 0 }),
    ).toBe(false);
  });
});
