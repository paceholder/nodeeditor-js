import { describe, expect, it } from "vitest";
import { boundsCentre, fragmentBounds, nodeFrame } from "./bounds.js";

const size = { width: 40, height: 20 };

describe("EDT-03 fragment bounds", () => {
  it("frames an unrotated node around its centre", () => {
    expect(nodeFrame({ position: { x: 100, y: 50 }, size })).toEqual({
      minX: 80,
      minY: 40,
      maxX: 120,
      maxY: 60,
    });
  });

  it("swaps width and height for odd quarter turns only", () => {
    const at = { x: 0, y: 0 };
    expect(nodeFrame({ position: at, size, rotation: 1 })).toEqual({
      minX: -10,
      minY: -20,
      maxX: 10,
      maxY: 20,
    });
    expect(nodeFrame({ position: at, size, rotation: 3 })).toEqual(
      nodeFrame({ position: at, size, rotation: 1 }),
    );
    expect(nodeFrame({ position: at, size, rotation: 2 })).toEqual(
      nodeFrame({ position: at, size }),
    );
  });

  it("unions node frames and centres the box", () => {
    const bounds = fragmentBounds([
      { position: { x: 0, y: 0 }, size },
      { position: { x: 100, y: 40 }, size, rotation: 1 },
    ]);
    expect(bounds).toEqual({ minX: -20, minY: -10, maxX: 110, maxY: 60 });
    expect(bounds && boundsCentre(bounds)).toEqual({ x: 45, y: 25 });
  });

  it("has no bounds without nodes", () => {
    expect(fragmentBounds([])).toBeUndefined();
  });
});
