/**
 * Path subdivision for the spatial index.
 *
 * A path is split into pieces at equal parameter steps. Cubic pieces come from de
 * Casteljau subdivision (blossoming), so each piece has exact control points and the box
 * around them contains the piece. The piece count grows with the control-polygon length,
 * so short wires stay one entry and long ones are bounded near the pointer.
 */
import type { PathGeometry } from "./path-geometry.js";
import { type Point, type Rect, rect } from "./spaces.js";

type W = "world";
type Cubic = Extract<PathGeometry, { kind: "cubic" }>;

/** Target world length of one indexed piece. */
export const PIECE_LENGTH = 800;
/** Upper bound of pieces per path. */
export const MAX_PIECES = 12;

const lerp = (a: Point<W>, b: Point<W>, t: number): Point<W> => ({
  x: a.x * (1 - t) + b.x * t,
  y: a.y * (1 - t) + b.y * t,
});

/** Length of the control polygon, an upper bound of the arc length. */
export function controlPolygonLength(path: PathGeometry): number {
  const pts =
    path.kind === "line"
      ? [path.p0, path.p1]
      : [path.p0, path.c1, path.c2, path.p1];
  let length = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1] as Point<W>;
    const b = pts[i] as Point<W>;
    length += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return length;
}

/** Pieces to index: one for a line, `ceil(length / PIECE_LENGTH)` clamped to [1, MAX_PIECES] for a cubic. */
export function pieceCount(path: PathGeometry): number {
  if (path.kind === "line") return 1;
  const k = Math.ceil(controlPolygonLength(path) / PIECE_LENGTH);
  return Number.isFinite(k) ? Math.min(MAX_PIECES, Math.max(1, k)) : 1;
}

/** Blossom of a cubic: de Casteljau with one parameter per level. */
function blossom(c: Cubic, t1: number, t2: number, t3: number): Point<W> {
  const a0 = lerp(c.p0, c.c1, t1);
  const a1 = lerp(c.c1, c.c2, t1);
  const a2 = lerp(c.c2, c.p1, t1);
  return lerp(lerp(a0, a1, t2), lerp(a1, a2, t2), t3);
}

/** The sub-curve of `c` on the parameter range [a, b]. */
function cubicPiece(c: Cubic, a: number, b: number): Cubic {
  return {
    kind: "cubic",
    p0: blossom(c, a, a, a),
    c1: blossom(c, a, a, b),
    c2: blossom(c, a, b, b),
    p1: blossom(c, b, b, b),
  };
}

/**
 * Split `path` into `count` pieces at equal parameter steps. Neighboring pieces share
 * their joint point exactly, and the first and last pieces keep the path's endpoints.
 */
export function splitPath(
  path: PathGeometry,
  count: number = pieceCount(path),
): PathGeometry[] {
  const k = Math.max(1, Math.floor(count));
  if (k === 1) return [path];
  const pieces: PathGeometry[] = [];
  for (let i = 0; i < k; i++) {
    const a = i / k;
    const b = (i + 1) / k;
    if (path.kind === "line") {
      pieces.push({
        kind: "line",
        p0: lerp(path.p0, path.p1, a),
        p1: lerp(path.p0, path.p1, b),
      });
    } else {
      pieces.push(cubicPiece(path, a, b));
    }
  }
  return pieces;
}

/** Box around the control points; it contains the path (convex hull property). */
export function controlBounds(path: PathGeometry): Rect<W> {
  let minX = Math.min(path.p0.x, path.p1.x);
  let minY = Math.min(path.p0.y, path.p1.y);
  let maxX = Math.max(path.p0.x, path.p1.x);
  let maxY = Math.max(path.p0.y, path.p1.y);
  if (path.kind === "cubic") {
    minX = Math.min(minX, path.c1.x, path.c2.x);
    minY = Math.min(minY, path.c1.y, path.c2.y);
    maxX = Math.max(maxX, path.c1.x, path.c2.x);
    maxY = Math.max(maxY, path.c1.y, path.c2.y);
  }
  return rect(minX, minY, maxX - minX, maxY - minY);
}
