import { describe, expect, it } from "vitest";
import { type PathGeometry, pathBounds, pathPointAt } from "./path-geometry.js";
import {
  controlBounds,
  controlPolygonLength,
  MAX_PIECES,
  PIECE_LENGTH,
  pieceCount,
  splitPath,
} from "./path-pieces.js";
import { rectContainsPoint, unionRects } from "./rect.js";
import { between, seededRandom } from "./test-utils.js";

const w = (x: number, y: number) => ({ x, y });

function randomCubic(rand: () => number, span: number): PathGeometry {
  const p = () => w(between(rand, -span, span), between(rand, -span, span));
  return { kind: "cubic", p0: p(), c1: p(), c2: p(), p1: p() };
}

function curves(): PathGeometry[] {
  const rand = seededRandom(41);
  const out: PathGeometry[] = [
    { kind: "line", p0: w(0, 0), p1: w(3000, 10) },
    { kind: "cubic", p0: w(5, 5), c1: w(5, 5), c2: w(5, 5), p1: w(5, 5) },
    // A port-to-port wire whose handles overshoot the endpoints.
    {
      kind: "cubic",
      p0: w(0, 0),
      c1: w(400, 0),
      c2: w(-400, 900),
      p1: w(0, 900),
    },
  ];
  for (let i = 0; i < 40; i++) out.push(randomCubic(rand, 1500));
  return out;
}

describe("path pieces for the spatial index", () => {
  it("piece count follows the control-polygon length, clamped to [1, 12]", () => {
    const L = PIECE_LENGTH;
    const short: PathGeometry = {
      kind: "cubic",
      p0: w(0, 0),
      c1: w(L / 4, 0),
      c2: w(L / 2, 0),
      p1: w(L, 0),
    };
    expect(controlPolygonLength(short)).toBe(L);
    expect(pieceCount(short)).toBe(1);
    expect(pieceCount({ ...short, p1: w(L + 10, 0) })).toBe(2);
    expect(pieceCount({ ...short, p1: w(1e6, 0) })).toBe(MAX_PIECES);
    expect(pieceCount({ kind: "line", p0: w(0, 0), p1: w(1e6, 0) })).toBe(1);
  });

  it("each piece's control-point box contains 200 sampled points of its piece", () => {
    for (const path of curves()) {
      const pieces = splitPath(path);
      expect(pieces.length).toBe(pieceCount(path));
      pieces.forEach((piece, i) => {
        const box = controlBounds(piece);
        for (let s = 0; s < 200; s++) {
          // Sample the original path inside this piece's parameter range.
          const t = (i + s / 199) / pieces.length;
          const q = pathPointAt(path, t);
          const eps = 1e-9 * (1 + Math.abs(q.x) + Math.abs(q.y));
          expect(
            rectContainsPoint(
              {
                x: box.x - eps,
                y: box.y - eps,
                w: box.w + 2 * eps,
                h: box.h + 2 * eps,
              },
              q,
            ),
          ).toBe(true);
        }
      });
    }
  });

  it("the pieces cover exactly the path: union of piece bounds equals its bounds", () => {
    for (const path of curves()) {
      for (const k of [1, 2, 5, MAX_PIECES]) {
        const pieces = splitPath(path, k);
        const union = pieces.map(pathBounds).reduce((a, b) => unionRects(a, b));
        const whole = pathBounds(path);
        expect(union.x).toBeCloseTo(whole.x, 9);
        expect(union.y).toBeCloseTo(whole.y, 9);
        expect(union.w).toBeCloseTo(whole.w, 9);
        expect(union.h).toBeCloseTo(whole.h, 9);
        expect(pieces[0]?.p0).toEqual(path.p0);
        expect(pieces[k - 1]?.p1).toEqual(path.p1);
        for (let i = 1; i < k; i++)
          expect(pieces[i]?.p0).toEqual(pieces[i - 1]?.p1);
      }
    }
  });
});
