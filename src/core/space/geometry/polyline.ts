/**
 * Polyline paths with optional rounded corners.
 *
 * A polyline runs from `p0` through its interior vertices `via` to `p1`. Each interior
 * vertex may carry a corner radius; the radii are fitted once, by `polylinePath`, so that
 * an arc's tangent length is at most half of each adjacent segment. Neighboring arcs
 * then never overlap, and a split at a segment midpoint never cuts an arc, so a piece of
 * the path draws and picks exactly the same arcs as the whole path. Arcs follow
 * canvas `arcTo` semantics: tangent to both segments at the corner.
 */
import type {
  EndTangents,
  NearestPoint,
  PathGeometry,
} from "./path-geometry.js";
import { type Point, type Rect, rect } from "./spaces.js";
import { distance, normalize, sub, type V2 } from "./vec.js";

type W = "world";

export type Polyline = Extract<PathGeometry, { kind: "polyline" }>;

const EPS = 1e-12;
const UNIT_X: V2 = { x: 1, y: 0 };
const TAU = 2 * Math.PI;

/** One drawable part: a straight piece or a circular arc. */
type Part =
  | {
      readonly kind: "seg";
      readonly a: V2;
      readonly b: V2;
      readonly len: number;
    }
  | {
      readonly kind: "arc";
      readonly c: V2;
      readonly r: number;
      /** Start angle and signed sweep, radians. */
      readonly a0: number;
      readonly sweep: number;
      readonly from: V2;
      readonly to: V2;
      readonly len: number;
    };

/** Every vertex in order: `p0`, the interior vertices, `p1`. */
export function polylineVertices(path: Polyline): Point<W>[] {
  return [path.p0, ...path.via, path.p1];
}

interface Turn {
  /** Unit direction into and out of the corner. */
  readonly uIn: V2;
  readonly uOut: V2;
  /** tan of half the turn angle; 0 when straight, Infinity on a reversal. */
  readonly tanHalf: number;
  /** +1 for a turn toward +cross (clockwise on screen), -1 otherwise. */
  readonly side: number;
}

function turnAt(prev: V2, at: V2, next: V2): Turn | undefined {
  const lenIn = distance(prev, at);
  const lenOut = distance(at, next);
  if (!(lenIn > EPS && lenOut > EPS)) return undefined;
  const uIn = { x: (at.x - prev.x) / lenIn, y: (at.y - prev.y) / lenIn };
  const uOut = { x: (next.x - at.x) / lenOut, y: (next.y - at.y) / lenOut };
  const cross = uIn.x * uOut.y - uIn.y * uOut.x;
  const dot = uIn.x * uOut.x + uIn.y * uOut.y;
  const tanHalf =
    1 + dot < EPS ? Number.POSITIVE_INFINITY : Math.abs(cross) / (1 + dot);
  return { uIn, uOut, tanHalf, side: cross >= 0 ? 1 : -1 };
}

/**
 * A polyline through `points` (at least one; a single point is a zero-length path) with
 * each corner rounded by at most `cornerRadius`. The radius at a corner is reduced so its
 * tangent length is at most half of each adjacent segment; straight-through vertices,
 * reversals and corners next to a zero-length segment stay sharp.
 */
export function polylinePath(
  points: readonly Point<W>[],
  cornerRadius = 0,
): Polyline {
  const first = points[0];
  if (!first) throw new Error("polylinePath needs at least one point");
  const last = points[points.length - 1] ?? first;
  const via = points.slice(1, -1);
  if (!(cornerRadius > 0) || via.length === 0)
    return { kind: "polyline", p0: first, via, p1: last };
  const radii: number[] = [];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1] as Point<W>;
    const at = points[i] as Point<W>;
    const next = points[i + 1] as Point<W>;
    const turn = turnAt(prev, at, next);
    if (!turn || !(turn.tanHalf > EPS) || !Number.isFinite(turn.tanHalf)) {
      radii.push(0);
      continue;
    }
    const room = Math.min(distance(prev, at), distance(at, next)) / 2;
    radii.push(Math.min(cornerRadius, room / turn.tanHalf));
  }
  if (radii.every((r) => r === 0))
    return { kind: "polyline", p0: first, via, p1: last };
  return { kind: "polyline", p0: first, via, p1: last, radii };
}

/** Tangent length of the arc at interior vertex `i` (0-based into `via`); 0 when sharp. */
export function cornerReach(path: Polyline, i: number): number {
  const r = path.radii?.[i] ?? 0;
  if (!(r > 0)) return 0;
  const v = polylineVertices(path);
  const turn = turnAt(v[i] as V2, v[i + 1] as V2, v[i + 2] as V2);
  if (!turn || !Number.isFinite(turn.tanHalf)) return 0;
  return r * turn.tanHalf;
}

function parts(path: Polyline): Part[] {
  const v = polylineVertices(path);
  const out: Part[] = [];
  let cursor: V2 = path.p0;
  const seg = (a: V2, b: V2) =>
    out.push({ kind: "seg", a, b, len: distance(a, b) });
  for (let i = 1; i < v.length - 1; i++) {
    const at = v[i] as V2;
    const r = path.radii?.[i - 1] ?? 0;
    const turn = r > 0 ? turnAt(v[i - 1] as V2, at, v[i + 1] as V2) : undefined;
    if (!turn || !Number.isFinite(turn.tanHalf) || turn.tanHalf <= EPS) {
      seg(cursor, at);
      cursor = at;
      continue;
    }
    const reach = r * turn.tanHalf;
    const from = { x: at.x - turn.uIn.x * reach, y: at.y - turn.uIn.y * reach };
    const to = { x: at.x + turn.uOut.x * reach, y: at.y + turn.uOut.y * reach };
    // The centre lies on the inner side of the incoming direction.
    const n = { x: -turn.uIn.y * turn.side, y: turn.uIn.x * turn.side };
    const c = { x: from.x + n.x * r, y: from.y + n.y * r };
    const angle = 2 * Math.atan(turn.tanHalf);
    seg(cursor, from);
    out.push({
      kind: "arc",
      c,
      r,
      a0: Math.atan2(from.y - c.y, from.x - c.x),
      sweep: turn.side * angle,
      from,
      to,
      len: r * angle,
    });
    cursor = to;
  }
  seg(cursor, path.p1);
  return out;
}

function partPointAt(part: Part, s: number): V2 {
  if (part.kind === "seg")
    return {
      x: part.a.x + (part.b.x - part.a.x) * s,
      y: part.a.y + (part.b.y - part.a.y) * s,
    };
  const a = part.a0 + part.sweep * s;
  return {
    x: part.c.x + part.r * Math.cos(a),
    y: part.c.y + part.r * Math.sin(a),
  };
}

/** Nearest point on one part: the point and its local fraction in [0, 1]. */
function partNearest(part: Part, p: V2): { point: V2; s: number } {
  if (part.kind === "seg") {
    const ab = sub(part.b, part.a);
    const len2 = ab.x * ab.x + ab.y * ab.y;
    const s =
      len2 === 0
        ? 0
        : Math.min(
            1,
            Math.max(
              0,
              ((p.x - part.a.x) * ab.x + (p.y - part.a.y) * ab.y) / len2,
            ),
          );
    return { point: partPointAt(part, s), s };
  }
  const span = Math.abs(part.sweep);
  if (distance(p, part.c) > EPS) {
    const ang = Math.atan2(p.y - part.c.y, p.x - part.c.x);
    const raw = part.sweep >= 0 ? ang - part.a0 : part.a0 - ang;
    const delta = ((raw % TAU) + TAU) % TAU;
    if (delta <= span) {
      const s = span > 0 ? delta / span : 0;
      return {
        point: {
          x: part.c.x + part.r * Math.cos(ang),
          y: part.c.y + part.r * Math.sin(ang),
        },
        s,
      };
    }
  }
  return distance(p, part.from) <= distance(p, part.to)
    ? { point: part.from, s: 0 }
    : { point: part.to, s: 1 };
}

/** Point at arc-length fraction `t` in [0, 1] (clamped). */
export function polylinePointAt(path: Polyline, t: number): Point<W> {
  const all = parts(path);
  const total = all.reduce((sum, part) => sum + part.len, 0);
  let left = Math.min(1, Math.max(0, t)) * total;
  for (const part of all) {
    if (left <= part.len)
      return partPointAt(part, part.len > 0 ? left / part.len : 0);
    left -= part.len;
  }
  return path.p1;
}

/** Closest point with `t` as the arc-length fraction; ties resolve to the smallest `t`. */
export function nearestOnPolyline(path: Polyline, p: Point<W>): NearestPoint {
  const all = parts(path);
  const total = all.reduce((sum, part) => sum + part.len, 0);
  let best: NearestPoint = {
    point: path.p0,
    t: 0,
    distance: Number.POSITIVE_INFINITY,
  };
  let walked = 0;
  for (const part of all) {
    const near = partNearest(part, p);
    const d = distance(near.point, p);
    if (d < best.distance - EPS) {
      const t =
        total > 0 ? Math.min(1, (walked + near.s * part.len) / total) : 0;
      best = { point: near.point, t, distance: d };
    }
    walked += part.len;
  }
  return best;
}

/** The vertex box; it contains the rounded path because arcs cut inside each corner. */
export function polylineBounds(path: Polyline): Rect<W> {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const v of polylineVertices(path)) {
    minX = Math.min(minX, v.x);
    minY = Math.min(minY, v.y);
    maxX = Math.max(maxX, v.x);
    maxY = Math.max(maxY, v.y);
  }
  return rect(minX, minY, maxX - minX, maxY - minY);
}

/** Directions of the first and last non-zero segments; +x for a fully degenerate path. */
export function polylineTangents(path: Polyline): EndTangents {
  const v = polylineVertices(path);
  let start: V2 | undefined;
  let end: V2 | undefined;
  for (let i = 1; i < v.length && !start; i++) {
    const d = sub(v[i] as V2, v[i - 1] as V2);
    if (Math.hypot(d.x, d.y) > EPS) start = normalize(d);
  }
  for (let i = v.length - 1; i > 0 && !end; i--) {
    const d = sub(v[i] as V2, v[i - 1] as V2);
    if (Math.hypot(d.x, d.y) > EPS) end = normalize(d);
  }
  return { start: start ?? UNIT_X, end: end ?? UNIT_X };
}

export function isFinitePolyline(path: Polyline): boolean {
  return (
    polylineVertices(path).every(
      (v) => Number.isFinite(v.x) && Number.isFinite(v.y),
    ) && (path.radii ?? []).every((r) => Number.isFinite(r) && r >= 0)
  );
}
