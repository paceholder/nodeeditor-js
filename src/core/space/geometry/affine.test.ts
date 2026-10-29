import { describe, expect, it } from "vitest";
import {
  affine,
  applyPoint,
  applyVector,
  compose,
  identity,
  invert,
} from "./affine.js";
import { between, seededRandom } from "./test-utils.js";

describe("affine transforms", () => {
  it("uses canvas setTransform order", () => {
    const m = affine(2, 0, 0, 3, 10, 20);
    expect(applyPoint(m, { x: 1, y: 1 })).toEqual({ x: 12, y: 23 });
    expect(applyVector(m, { x: 1, y: 1 })).toEqual({ x: 2, y: 3 });
  });

  it("compose applies the inner transform first", () => {
    const inner = affine(1, 0, 0, 1, 5, 0);
    const outer = affine(2, 0, 0, 2, 0, 0);
    expect(applyPoint(compose(outer, inner), { x: 1, y: 1 })).toEqual({
      x: 12,
      y: 2,
    });
    expect(compose(identity(), inner)).toEqual(inner);
  });

  it("invert round-trips random seeded matrices", () => {
    const rnd = seededRandom(7);
    for (let i = 0; i < 500; i++) {
      const m = affine(
        between(rnd, 0.5, 3),
        between(rnd, -1, 1),
        between(rnd, -1, 1),
        between(rnd, 0.5, 3),
        between(rnd, -1000, 1000),
        between(rnd, -1000, 1000),
      );
      const inv = invert(m);
      if (!inv.ok) continue;
      const p = { x: between(rnd, -1e4, 1e4), y: between(rnd, -1e4, 1e4) };
      const back = applyPoint(inv.value, applyPoint(m, p));
      expect(back.x).toBeCloseTo(p.x, 6);
      expect(back.y).toBeCloseTo(p.y, 6);
    }
  });

  it("non-invertible matrices are refused with a rejection", () => {
    for (const m of [
      affine(0, 0, 0, 0, 0, 0),
      affine(1, 2, 2, 4, 0, 0),
      affine(Number.NaN, 0, 0, 1, 0, 0),
      affine(1e-7, 0, 0, 1e-7, 0, 0),
    ]) {
      const r = invert(m);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("non-invertible");
    }
  });
});
