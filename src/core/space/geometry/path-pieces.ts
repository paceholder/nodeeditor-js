/**
 * Path subdivision for the spatial index (PERF-04).
 *
 * A path is split into pieces at equal parameter steps. Cubic pieces come from de
 * Casteljau subdivision (blossoming), so each piece has exact control points and the box
 * around them contains the piece. The piece count grows with the control-polygon length,
 * so short wires stay one entry and long ones are bounded near the pointer.
 *
 * A polyline is split at the midpoints of its interior segments, so each piece holds one
 * corner with its arc; a segment longer than `PIECE_LENGTH` is also split at equal steps,
 * moved outside any arc. Pieces carry the fitted radii of their corners, so distances on
 * a piece are exact, and when there are more than `MAX_PIECES` consecutive pieces are
 * merged into evenly sized groups.
 */
import type { PathGeometry } from "./path-geometry.js";
import {
  cornerReach,
  type Polyline,
  polylineBounds,
  polylineVertices,
} from "./polyline.js";
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
      : path.kind === "cubic"
        ? [path.p0, path.c1, path.c2, path.p1]
        : polylineVertices(path);
  let length = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1] as Point<W>;
    const b = pts[i] as Point<W>;
    length += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return length;
}

/**
 * Pieces to index: one for a line, `ceil(length / PIECE_LENGTH)` clamped to
 * [1, MAX_PIECES] for a cubic, one per corner (plus long-segment steps) for a polyline.
 */
export function pieceCount(path: PathGeometry): number {
  if (path.kind === "line") return 1;
  if (path.kind === "polyline") return splitPolyline(path, MAX_PIECES).length;
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
 * Split `path` into `count` pieces at equal parameter steps; for a polyline `count` is
 * the upper bound of its corner pieces. Neighboring pieces share their joint point
 * exactly, and the first and last pieces keep the path's endpoints.
 */
export function splitPath(path: PathGeometry, count?: number): PathGeometry[] {
  if (path.kind === "polyline") return splitPolyline(path, count ?? MAX_PIECES);
  const k = Math.max(1, Math.floor(count ?? pieceCount(path)));
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

/** A split position: segment `seg` (from vertex `seg`) at distance `at` along it. */
interface Cut {
  readonly seg: number;
  readonly at: number;
  readonly point: Point<W>;
}

function polylineCuts(path: Polyline, v: readonly Point<W>[]): Cut[] {
  const cuts: Cut[] = [];
  const last = v.length - 2;
  const reach = (j: number) =>
    j <= 0 || j > last ? 0 : cornerReach(path, j - 1);
  for (let seg = 0; seg <= last; seg++) {
    const a = v[seg] as Point<W>;
    const b = v[seg + 1] as Point<W>;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.ceil(len / PIECE_LENGTH);
    const interior = seg > 0 && seg < last;
    const k = Math.max(interior ? 2 : 1, Number.isFinite(steps) ? steps : 1);
    const lo = reach(seg);
    const hi = len - reach(seg + 1);
    let prev = Number.NaN;
    for (let j = 1; j < k; j++) {
      const at = Math.min(hi, Math.max(lo, (len * j) / k));
      if (at === prev || !(at >= 0 && at <= len)) continue;
      if (!interior && (at <= 0 || at >= len)) continue;
      prev = at;
      const point = at === 0 ? a : at === len ? b : lerp(a, b, at / (len || 1));
      cuts.push({ seg, at, point });
    }
  }
  return cuts;
}

/** Polyline pieces between kept cuts, at most `max` of them (evenly merged groups). */
function splitPolyline(path: Polyline, max: number): PathGeometry[] {
  const v = polylineVertices(path);
  const all = polylineCuts(path, v);
  const cap = Math.max(1, Math.floor(max));
  const m = all.length + 1;
  const cuts =
    m <= cap
      ? all
      : Array.from(
          { length: cap - 1 },
          (_, g) => all[Math.floor(((g + 1) * m) / cap) - 1] as Cut,
        );
  if (cuts.length === 0) return [path];
  const bounds: Cut[] = [
    { seg: 0, at: 0, point: path.p0 },
    ...cuts,
    { seg: v.length - 2, at: Number.POSITIVE_INFINITY, point: path.p1 },
  ];
  const pieces: PathGeometry[] = [];
  for (let i = 1; i < bounds.length; i++) {
    const from = bounds[i - 1] as Cut;
    const to = bounds[i] as Cut;
    const via: Point<W>[] = [];
    const radii: number[] = [];
    for (let j = from.seg + 1; j <= to.seg; j++) {
      via.push(v[j] as Point<W>);
      radii.push(path.radii?.[j - 1] ?? 0);
    }
    pieces.push(
      path.radii
        ? { kind: "polyline", p0: from.point, via, p1: to.point, radii }
        : { kind: "polyline", p0: from.point, via, p1: to.point },
    );
  }
  return pieces;
}

/** Box around the control points; it contains the path (convex hull property). */
export function controlBounds(path: PathGeometry): Rect<W> {
  if (path.kind === "polyline") return polylineBounds(path);
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
