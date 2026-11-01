import { describe, expect, it } from "vitest";
import {
  type PathGeometry,
  pathBounds,
  pathDistance,
  pathPointAt,
} from "./path-geometry.js";
import {
  controlBounds,
  controlPolygonLength,
  MAX_PIECES,
  PIECE_LENGTH,
  pieceCount,
  splitPath,
} from "./path-pieces.js";
import { polylinePath } from "./polyline.js";
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

describe("PERF-04 path pieces for the spatial index", () => {
  it("PERF-04 piece count follows the control-polygon length, clamped to [1, 12]", () => {
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

  it("PERF-04 each piece's control-point box contains 200 sampled points of its piece", () => {
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

  it("PERF-04 the pieces cover exactly the path: union of piece bounds equals its bounds", () => {
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

type Poly = Extract<PathGeometry, { kind: "polyline" }>;

const POLYLINES: Poly[] = [
  // An S with rounded corners, a U with corners rounded to fit, and a sharp staircase.
  polylinePath([w(0, 0), w(400, 0), w(400, 300), w(900, 300)], 12),
  polylinePath([w(0, 0), w(120, 0), w(120, 40), w(100, 40)], 30),
  polylinePath(
    Array.from({ length: 8 }, (_, i) =>
      w(Math.ceil(i / 2) * 60, Math.floor(i / 2) * 40),
    ),
    6,
  ),
];

function joinsExactly(path: PathGeometry, pieces: PathGeometry[]) {
  expect(pieces[0]?.p0).toEqual(path.p0);
  expect(pieces[pieces.length - 1]?.p1).toEqual(path.p1);
  for (let i = 1; i < pieces.length; i++)
    expect(pieces[i]?.p0).toEqual(pieces[i - 1]?.p1);
}

describe("PERF-04 polyline pieces", () => {
  it("PERF-04 each corner and its arc lies in exactly one piece", () => {
    for (const path of POLYLINES) {
      const pieces = splitPath(path) as Poly[];
      expect(pieces.length).toBe(Math.max(1, path.via.length));
      pieces.forEach((piece, i) => {
        expect(piece.kind).toBe("polyline");
        expect(piece.via).toEqual([path.via[i]]);
        expect(piece.radii).toEqual(path.radii ? [path.radii[i]] : undefined);
      });
      expect(pieceCount(path)).toBe(pieces.length);
    }
  });

  it("PERF-04 the pieces' vertices join exactly and keep the endpoints", () => {
    for (const path of POLYLINES) joinsExactly(path, splitPath(path));
  });

  it("PERF-04 pathDistance over the pieces equals pathDistance of the whole path", () => {
    const rnd = seededRandom(9);
    for (const path of POLYLINES) {
      const pieces = splitPath(path);
      const box = pathBounds(path);
      for (let i = 0; i < 200; i++) {
        const p = w(
          between(rnd, box.x - 50, box.x + box.w + 50),
          between(rnd, box.y - 50, box.y + box.h + 50),
        );
        const min = Math.min(...pieces.map((s) => pathDistance(s, p)));
        expect(min).toBeCloseTo(pathDistance(path, p), 9);
      }
      for (const piece of pieces) {
        const b = controlBounds(piece);
        for (let s = 0; s <= 100; s++) {
          const q = pathPointAt(piece, s / 100);
          expect(rectContainsPoint(b, q)).toBe(true);
        }
      }
    }
  });

  it("PERF-04 a 5000-unit segment is split outside the arcs", () => {
    const straight = polylinePath([w(0, 0), w(5000, 0)]);
    const pieces = splitPath(straight);
    expect(pieces.length).toBe(Math.ceil(5000 / PIECE_LENGTH));
    joinsExactly(straight, pieces);
    const bent = polylinePath([w(0, 0), w(5000, 0), w(5000, 100)], 40);
    const bentPieces = splitPath(bent);
    expect(bentPieces.length).toBe(Math.ceil(5000 / PIECE_LENGTH));
    joinsExactly(bent, bentPieces);
    // The last piece holds the whole corner arc, which starts 40 units before it.
    const lastPiece = bentPieces[bentPieces.length - 1] as Poly;
    expect(lastPiece.via).toEqual([w(5000, 0)]);
    expect(lastPiece.p0.x).toBeLessThanOrEqual(5000 - 40);
  });

  it("PERF-04 a 30-corner polyline yields 12 pieces", () => {
    const stairs = Array.from({ length: 32 }, (_, i) =>
      w(Math.ceil(i / 2) * 50, Math.floor(i / 2) * 50),
    );
    const path = polylinePath(stairs, 5) as Poly;
    expect(path.via.length).toBe(30);
    const pieces = splitPath(path);
    expect(pieces.length).toBe(MAX_PIECES);
    expect(pieceCount(path)).toBe(MAX_PIECES);
    joinsExactly(path, pieces);
    const corners = pieces.flatMap((p) => (p as Poly).via);
    expect(corners).toEqual(path.via);
  });
});
