/**
 * Renderer-neutral connection path geometry in world space.
 *
 * Every consumer switches exhaustively on `kind`. All functions return finite numbers for
 * finite input, including zero-length lines, cubics with coincident points and fully
 * coincident polylines. The polyline math lives in `polyline.ts`.
 */
import {
  isFinitePolyline,
  nearestOnPolyline,
  polylineBounds,
  polylinePointAt,
  polylineTangents,
} from "./polyline.js";
import { type Point, type Rect, rect } from "./spaces.js";
import { distance, distanceToSegment, normalize, sub, type V2 } from "./vec.js";

type W = "world";

export type PathGeometry =
  | { readonly kind: "line"; readonly p0: Point<W>; readonly p1: Point<W> }
  | {
      readonly kind: "cubic";
      readonly p0: Point<W>;
      readonly c1: Point<W>;
      readonly c2: Point<W>;
      readonly p1: Point<W>;
    }
  | {
      readonly kind: "polyline";
      readonly p0: Point<W>;
      /** Interior vertices (bends), in order from p0 to p1. */
      readonly via: readonly Point<W>[];
      readonly p1: Point<W>;
      /** Arc radius at each interior vertex, already fitted; omitted means all sharp. */
      readonly radii?: readonly number[];
    };

export interface NearestPoint {
  readonly point: Point<W>;
  /** Curve parameter in [0, 1]; the arc-length fraction on a polyline. */
  readonly t: number;
  readonly distance: number;
}

export interface EndTangents {
  /** Unit direction of travel at the start. */
  readonly start: Point<W>;
  /** Unit direction of travel at the end. */
  readonly end: Point<W>;
}

const UNIT_X: V2 = { x: 1, y: 0 };
const SUBDIVISIONS = 16;
const NEWTON_STEPS = 4;

function cubicAt(
  path: Extract<PathGeometry, { kind: "cubic" }>,
  t: number,
): V2 {
  const u = 1 - t;
  const w0 = u * u * u;
  const w1 = 3 * u * u * t;
  const w2 = 3 * u * t * t;
  const w3 = t * t * t;
  return {
    x: w0 * path.p0.x + w1 * path.c1.x + w2 * path.c2.x + w3 * path.p1.x,
    y: w0 * path.p0.y + w1 * path.c1.y + w2 * path.c2.y + w3 * path.p1.y,
  };
}

function cubicD1(
  path: Extract<PathGeometry, { kind: "cubic" }>,
  t: number,
): V2 {
  const u = 1 - t;
  const k0 = 3 * u * u;
  const k1 = 6 * u * t;
  const k2 = 3 * t * t;
  return {
    x:
      k0 * (path.c1.x - path.p0.x) +
      k1 * (path.c2.x - path.c1.x) +
      k2 * (path.p1.x - path.c2.x),
    y:
      k0 * (path.c1.y - path.p0.y) +
      k1 * (path.c2.y - path.c1.y) +
      k2 * (path.p1.y - path.c2.y),
  };
}

function cubicD2(
  path: Extract<PathGeometry, { kind: "cubic" }>,
  t: number,
): V2 {
  const u = 1 - t;
  return {
    x:
      6 * u * (path.c2.x - 2 * path.c1.x + path.p0.x) +
      6 * t * (path.p1.x - 2 * path.c2.x + path.c1.x),
    y:
      6 * u * (path.c2.y - 2 * path.c1.y + path.p0.y) +
      6 * t * (path.p1.y - 2 * path.c2.y + path.c1.y),
  };
}

/** Parameter of the point at `t` in [0, 1] (clamped). */
export function pathPointAt(path: PathGeometry, t: number): Point<W> {
  const c = Math.min(1, Math.max(0, t));
  switch (path.kind) {
    case "line":
      return {
        x: path.p0.x + (path.p1.x - path.p0.x) * c,
        y: path.p0.y + (path.p1.y - path.p0.y) * c,
      };
    case "cubic":
      return cubicAt(path, c);
    case "polyline":
      return polylinePointAt(path, c);
  }
}

/** Interior roots in (0, 1) of the derivative of one cubic Bezier coordinate. */
function derivativeRoots(
  p0: number,
  c1: number,
  c2: number,
  p1: number,
): number[] {
  const a = 3 * (-p0 + 3 * c1 - 3 * c2 + p1);
  const b = 6 * (p0 - 2 * c1 + c2);
  const c = 3 * (c1 - p0);
  const roots: number[] = [];
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) > 1e-12) roots.push(-c / b);
  } else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const s = Math.sqrt(disc);
      roots.push((-b + s) / (2 * a), (-b - s) / (2 * a));
    }
  }
  return roots.filter((t) => t > 0 && t < 1);
}

/** Exact bounds: endpoints plus the extrema from the derivative roots. */
export function pathBounds(path: PathGeometry): Rect<W> {
  switch (path.kind) {
    case "line": {
      const x = Math.min(path.p0.x, path.p1.x);
      const y = Math.min(path.p0.y, path.p1.y);
      return rect(
        x,
        y,
        Math.abs(path.p1.x - path.p0.x),
        Math.abs(path.p1.y - path.p0.y),
      );
    }
    case "cubic": {
      const ts = [
        0,
        1,
        ...derivativeRoots(path.p0.x, path.c1.x, path.c2.x, path.p1.x),
        ...derivativeRoots(path.p0.y, path.c1.y, path.c2.y, path.p1.y),
      ];
      let minX = Number.POSITIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      for (const t of ts) {
        const p = cubicAt(path, t);
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
      return rect(minX, minY, maxX - minX, maxY - minY);
    }
    case "polyline":
      return polylineBounds(path);
  }
}

function nearestOnCubic(
  path: Extract<PathGeometry, { kind: "cubic" }>,
  p: V2,
): NearestPoint {
  const samples: { t: number; d: number }[] = [];
  for (let i = 0; i <= SUBDIVISIONS; i++) {
    const t = i / SUBDIVISIONS;
    samples.push({ t, d: distance(cubicAt(path, t), p) });
  }
  let best: NearestPoint = {
    point: path.p0,
    t: 0,
    distance: Number.POSITIVE_INFINITY,
  };
  samples.forEach((s, i) => {
    const prev = samples[i - 1];
    const next = samples[i + 1];
    const isMin = (!prev || s.d <= prev.d) && (!next || s.d <= next.d);
    if (!isMin) return;
    let t = s.t;
    let d = s.d;
    const lo = Math.max(0, t - 1 / SUBDIVISIONS);
    const hi = Math.min(1, t + 1 / SUBDIVISIONS);
    for (let k = 0; k < NEWTON_STEPS; k++) {
      const q = cubicAt(path, t);
      const d1 = cubicD1(path, t);
      const d2 = cubicD2(path, t);
      const diff = sub(q, p);
      const g = diff.x * d1.x + diff.y * d1.y;
      const h = d1.x * d1.x + d1.y * d1.y + diff.x * d2.x + diff.y * d2.y;
      if (h <= 1e-12) break;
      const nt = Math.min(hi, Math.max(lo, t - g / h));
      const nd = distance(cubicAt(path, nt), p);
      if (nd > d) break;
      t = nt;
      d = nd;
    }
    if (d < best.distance - 1e-12)
      best = { point: cubicAt(path, t), t, distance: d };
  });
  return best;
}

/** Closest point on the path; ties resolve to the smallest parameter. */
export function nearestPoint(path: PathGeometry, p: Point<W>): NearestPoint {
  switch (path.kind) {
    case "line": {
      const ab = sub(path.p1, path.p0);
      const len2 = ab.x * ab.x + ab.y * ab.y;
      const t =
        len2 === 0
          ? 0
          : Math.min(
              1,
              Math.max(
                0,
                ((p.x - path.p0.x) * ab.x + (p.y - path.p0.y) * ab.y) / len2,
              ),
            );
      const point = pathPointAt(path, t);
      return { point, t, distance: distance(point, p) };
    }
    case "cubic":
      return nearestOnCubic(path, p);
    case "polyline":
      return nearestOnPolyline(path, p);
  }
}

export function pathDistance(path: PathGeometry, p: Point<W>): number {
  if (path.kind === "line") return distanceToSegment(p, path.p0, path.p1);
  return nearestPoint(path, p).distance;
}

/**
 * Unit tangents (direction of travel) at both ends. Coincident control points fall back
 * to the next distinct point, and a fully degenerate path reports +x.
 */
export function endTangents(path: PathGeometry): EndTangents {
  switch (path.kind) {
    case "line": {
      const d = normalize(sub(path.p1, path.p0), UNIT_X);
      return { start: d, end: d };
    }
    case "cubic": {
      const start = normalize(
        sub(path.c1, path.p0),
        normalize(
          sub(path.c2, path.p0),
          normalize(sub(path.p1, path.p0), UNIT_X),
        ),
      );
      const end = normalize(
        sub(path.p1, path.c2),
        normalize(
          sub(path.p1, path.c1),
          normalize(sub(path.p1, path.p0), UNIT_X),
        ),
      );
      return { start, end };
    }
    case "polyline":
      return polylineTangents(path);
  }
}

export function isFinitePath(path: PathGeometry): boolean {
  if (path.kind === "polyline") return isFinitePolyline(path);
  const pts =
    path.kind === "line"
      ? [path.p0, path.p1]
      : [path.p0, path.c1, path.c2, path.p1];
  return pts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
}
