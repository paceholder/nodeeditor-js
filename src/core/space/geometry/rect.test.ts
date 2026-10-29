import { describe, expect, it } from "vitest";
import { identity } from "./affine.js";
import {
  checkWorldPoint,
  clampZoom,
  isInWorldRange,
  MAX_WORLD_COORD,
} from "./limits.js";
import {
  inflateRect,
  intersectRects,
  rectContainsPoint,
  rectFromPoints,
  rectsIntersect,
  transformRect,
  unionRects,
} from "./rect.js";
import { isFiniteRect, rect } from "./spaces.js";

describe("rectangles and finite ranges", () => {
  it("zero-size rectangles are valid and produce finite results", () => {
    const z = rect<"world">(5, 5, 0, 0);
    expect(isFiniteRect(z)).toBe(true);
    expect(rectContainsPoint(z, { x: 5, y: 5 })).toBe(true);
    expect(rectsIntersect(z, rect(0, 0, 5, 5))).toBe(true);
    expect(inflateRect(z, 2)).toEqual(rect(3, 3, 4, 4));
    expect(inflateRect(z, -2)).toEqual(z);
    expect(unionRects(z, z)).toEqual(z);
    expect(transformRect(identity(), z)).toEqual(z);
  });

  it("rejects non-finite values", () => {
    expect(isFiniteRect(rect(Number.NaN, 0, 1, 1))).toBe(false);
    expect(isFiniteRect(rect(0, 0, -1, 1))).toBe(false);
    const bad = checkWorldPoint({ x: Number.POSITIVE_INFINITY, y: 0 });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.code).toBe("non-finite");
    const far = checkWorldPoint({ x: MAX_WORLD_COORD * 2, y: 0 });
    if (!far.ok) expect(far.error.code).toBe("out-of-range");
    expect(far.ok).toBe(false);
    expect(isInWorldRange({ x: MAX_WORLD_COORD, y: -MAX_WORLD_COORD })).toBe(
      true,
    );
    expect(clampZoom(Number.NaN).ok).toBe(false);
  });

  it("intersection is boundary-inclusive and disjoint rects give undefined", () => {
    expect(rectsIntersect(rect(0, 0, 1, 1), rect(1, 0, 1, 1))).toBe(true);
    expect(intersectRects(rect(0, 0, 1, 1), rect(2, 0, 1, 1))).toBeUndefined();
    expect(intersectRects(rect(0, 0, 4, 4), rect(2, 2, 4, 4))).toEqual(
      rect(2, 2, 2, 2),
    );
    expect(rectFromPoints({ x: 3, y: 1 }, { x: 1, y: 4 })).toEqual(
      rect(1, 1, 2, 3),
    );
  });
});
