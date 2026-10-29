import { describe, expect, it } from "vitest";
import type { QuarterTurns } from "../../data/model/values.js";
import { applyPoint, applyVector, compose, invert } from "./affine.js";
import { nodeTransform } from "./node-transform.js";
import { transformRect } from "./rect.js";
import { rect } from "./spaces.js";

const TURNS: QuarterTurns[] = [0, 1, 2, 3];
const W = 25;
const H = 49;

describe("GEO-02a node transform", () => {
  it("GEO-02a covers all 8 rotation and mirror states of a 25x49 body", () => {
    const body = rect<"local">(-W / 2, -H / 2, W, H);
    for (const rotation of TURNS) {
      for (const mirrored of [false, true]) {
        const t = nodeTransform({
          position: { x: 100, y: 200 },
          rotation,
          mirrored,
        });
        const bounds = transformRect(t, body);
        const swapped = rotation % 2 === 1;
        expect(bounds.w).toBe(swapped ? H : W);
        expect(bounds.h).toBe(swapped ? W : H);
        // The body center stays at the node position in every state.
        expect(bounds.x + bounds.w / 2).toBe(100);
        expect(bounds.y + bounds.h / 2).toBe(200);
        // Corner anchors land on the corners of the transformed bounds.
        for (const c of [
          { x: -W / 2, y: -H / 2 },
          { x: W / 2, y: H / 2 },
        ]) {
          const p = applyPoint(t, c);
          const onX = p.x === bounds.x || p.x === bounds.x + bounds.w;
          const onY = p.y === bounds.y || p.y === bounds.y + bounds.h;
          expect(onX && onY).toBe(true);
        }
        // Linear part is orthonormal: normals keep unit length.
        const n = applyVector(t, { x: 1, y: 0 });
        expect(Math.hypot(n.x, n.y)).toBe(1);
        // The inverse maps back exactly for integer inputs.
        const inv = invert(t);
        expect(inv.ok).toBe(true);
        if (inv.ok)
          expect(applyPoint(compose(inv.value, t), { x: 3, y: -7 })).toEqual({
            x: 3,
            y: -7,
          });
      }
    }
  });

  it("GEO-02a rotates normals clockwise per quarter turn and mirrors x first", () => {
    const at = (rotation: QuarterTurns, mirrored: boolean) =>
      applyVector(
        nodeTransform({ position: { x: 0, y: 0 }, rotation, mirrored }),
        { x: 1, y: 0 },
      );
    expect(at(0, false)).toEqual({ x: 1, y: 0 });
    expect(at(1, false)).toEqual({ x: 0, y: 1 });
    expect(at(2, false)).toEqual({ x: -1, y: 0 });
    expect(at(3, false)).toEqual({ x: 0, y: -1 });
    expect(at(0, true)).toEqual({ x: -1, y: 0 });
    expect(at(1, true)).toEqual({ x: 0, y: -1 });
  });

  it("GEO-02a four quarter turns return a point bit-identical", () => {
    const p = { x: 0.1 + 0.2, y: -1 / 3 };
    let q = p;
    const turn = nodeTransform({
      position: { x: 0, y: 0 },
      rotation: 1,
      mirrored: false,
    });
    for (let i = 0; i < 4; i++) q = applyPoint(turn, q);
    expect(Object.is(q.x, p.x)).toBe(true);
    expect(Object.is(q.y, p.y)).toBe(true);
    // No negative zeros leak out of exact entries.
    const t = nodeTransform({
      position: { x: 0, y: 0 },
      rotation: 2,
      mirrored: true,
    });
    expect(Object.is(applyPoint(t, { x: 0, y: 0 }).x, 0)).toBe(true);
  });

  it("GEO-02 persisted position is a world value independent of zoom", () => {
    const t = nodeTransform({
      position: { x: 12.5, y: -3.25 },
      rotation: 0,
      mirrored: false,
    });
    expect(applyPoint(t, { x: 0, y: 0 })).toEqual({ x: 12.5, y: -3.25 });
  });
});
