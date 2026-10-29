import { describe, expect, it } from "vitest";
import { bezierPath, buildPath, straightPath } from "./connection-paths.js";
import { pathBounds } from "./path-geometry.js";

describe("straight and bezier modes", () => {
  it("straight and bezier modes: handles follow the anchor normals", () => {
    const p = bezierPath(
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 300, y: 0 },
      { x: -1, y: 0 },
    );
    expect(p).toEqual({
      kind: "cubic",
      p0: { x: 0, y: 0 },
      c1: { x: 150, y: 0 },
      c2: { x: 150, y: 0 },
      p1: { x: 300, y: 0 },
    });
    const far = bezierPath(
      { x: 0, y: 0 },
      { x: 0, y: -1 },
      { x: 2000, y: 0 },
      { x: 0, y: 1 },
    );
    if (far.kind !== "cubic") throw new Error("kind");
    expect(far.c1).toEqual({ x: 0, y: -200 });
    expect(far.c2).toEqual({ x: 2000, y: 200 });
    const near = bezierPath(
      { x: 0, y: 0 },
      { x: -1, y: 0 },
      { x: 10, y: 0 },
      { x: 1, y: 0 },
    );
    if (near.kind !== "cubic") throw new Error("kind");
    expect(near.c1).toEqual({ x: -20, y: 0 });
    expect(straightPath({ x: 1, y: 2 }, { x: 3, y: 4 })).toEqual({
      kind: "line",
      p0: { x: 1, y: 2 },
      p1: { x: 3, y: 4 },
    });
  });

  it("buildPath switches on the mode and ignores normals when straight", () => {
    const a = { position: { x: 0, y: 0 }, normal: { x: 1, y: 0 } };
    const b = { position: { x: 100, y: 0 }, normal: { x: -1, y: 0 } };
    expect(buildPath("straight", a, b).kind).toBe("line");
    expect(buildPath("bezier", a, b).kind).toBe("cubic");
  });

  it("coincident anchors and zero normals produce finite paths", () => {
    const here = { x: 5, y: 5 };
    const p = bezierPath(here, { x: 0, y: 0 }, here, { x: Number.NaN, y: 0 });
    const b = pathBounds(p);
    expect(Object.values(b).every(Number.isFinite)).toBe(true);
    const s = pathBounds(straightPath(here, here));
    expect(s).toEqual({ x: 5, y: 5, w: 0, h: 0 });
  });
});
