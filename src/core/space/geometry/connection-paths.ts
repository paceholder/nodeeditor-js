/**
 * Default connection path builders (ROU-01: straight and cubic-Bezier modes).
 *
 * Orthogonal and obstacle-aware routing arrive in later changes; `RouteMode` is a union
 * so they can be added without touching callers that switch exhaustively.
 */

import type { PathGeometry } from "./path-geometry.js";
import type { Point } from "./spaces.js";
import { normalize, sub } from "./vec.js";

type W = "world";

export type RouteMode = "straight" | "bezier";

export const BEZIER_MIN_HANDLE = 20;
export const BEZIER_MAX_HANDLE = 200;

export function straightPath(p0: Point<W>, p1: Point<W>): PathGeometry {
  return { kind: "line", p0, p1 };
}

/**
 * Control points sit at `p0 + n0*k` and `p1 + n1*k` with
 * `k = clamp(|p1 - p0| / 2, 20, 200)` world units. A zero or non-finite normal falls back
 * to pointing toward the other anchor (or +x when the anchors coincide).
 */
export function bezierPath(
  p0: Point<W>,
  n0: Point<W>,
  p1: Point<W>,
  n1: Point<W>,
): PathGeometry {
  const span = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  const k = Math.min(BEZIER_MAX_HANDLE, Math.max(BEZIER_MIN_HANDLE, span / 2));
  const toEnd = normalize(sub(p1, p0));
  const u0 = normalize(n0, toEnd);
  const u1 = normalize(n1, { x: -toEnd.x, y: -toEnd.y });
  return {
    kind: "cubic",
    p0,
    c1: { x: p0.x + u0.x * k, y: p0.y + u0.y * k },
    c2: { x: p1.x + u1.x * k, y: p1.y + u1.y * k },
    p1,
  };
}

export interface PathEnd {
  readonly position: Point<W>;
  readonly normal: Point<W>;
}

export function buildPath(
  mode: RouteMode,
  from: PathEnd,
  to: PathEnd,
): PathGeometry {
  switch (mode) {
    case "straight":
      return straightPath(from.position, to.position);
    case "bezier":
      return bezierPath(from.position, from.normal, to.position, to.normal);
  }
}
