/**
 * Validity and choice of orthogonal candidates (ROU-01a, ROU-01b, ROU-04; D4 steps 4
 * and 5).
 *
 * A candidate is valid when it leaves along the source's escape direction, enters along
 * the reverse of the target's, never reverses (no 180-degree turn back over a segment),
 * and no segment crosses the open interior of either endpoint body. The first segment is
 * exempt from the source body and the last from the target body (the escape at a port
 * that lies inside its own body box); for a connection to the same node both exemptions
 * apply to that one body. Unrelated nodes are not obstacles (ROU-05).
 */
import type { Point, Rect } from "../geometry/spaces.js";
import {
  type Candidate,
  FAMILIES,
  type OrthogonalEnd,
} from "./orthogonal-candidates.js";

type W = "world";

/** Minimum cosine between a segment and the required escape direction. */
const SAME_DIRECTION = 1 - 1e-9;

const sameRect = (a: Rect<W>, b: Rect<W>): boolean =>
  a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

/** Does segment `a`-`b` cross the open interior of `r`? Exact for axis segments. */
export function crossesInterior(a: Point<W>, b: Point<W>, r: Rect<W>): boolean {
  return (
    Math.max(a.x, b.x) > r.x &&
    Math.min(a.x, b.x) < r.x + r.w &&
    Math.max(a.y, b.y) > r.y &&
    Math.min(a.y, b.y) < r.y + r.h
  );
}

function unit(a: Point<W>, b: Point<W>): Point<W> {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  return len > 0
    ? { x: (b.x - a.x) / len, y: (b.y - a.y) / len }
    : { x: 0, y: 0 };
}

export function isValidCandidate(
  points: readonly Point<W>[],
  from: OrthogonalEnd,
  to: OrthogonalEnd,
): boolean {
  const n = points.length - 1;
  const first = unit(points[0] as Point<W>, points[1] as Point<W>);
  const last = unit(points[n - 1] as Point<W>, points[n] as Point<W>);
  if (first.x * from.dir.x + first.y * from.dir.y < SAME_DIRECTION)
    return false;
  if (-(last.x * to.dir.x + last.y * to.dir.y) < SAME_DIRECTION) return false;
  const same = from.body && to.body && sameRect(from.body, to.body);
  let prev: Point<W> | undefined;
  for (let i = 0; i < n; i++) {
    const a = points[i] as Point<W>;
    const b = points[i + 1] as Point<W>;
    const dir = unit(a, b);
    if (prev && prev.x * dir.x + prev.y * dir.y < 0) return false;
    prev = dir;
    const exemptFrom = i === 0 || (same && i === n - 1);
    const exemptTo = i === n - 1 || (same && i === 0);
    if (from.body && !exemptFrom && crossesInterior(a, b, from.body))
      return false;
    if (to.body && !exemptTo && crossesInterior(a, b, to.body)) return false;
  }
  return true;
}

export interface Scored {
  readonly candidate: Candidate;
  readonly valid: boolean;
  readonly bends: number;
  readonly length: number;
  /** Corners ordered by (y, x): the order-independent final tie-break. */
  readonly corners: readonly Point<W>[];
}

export function score(
  candidate: Candidate,
  from: OrthogonalEnd,
  to: OrthogonalEnd,
): Scored {
  const pts = candidate.points;
  let length = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1] as Point<W>;
    const b = pts[i] as Point<W>;
    length += Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
  }
  const corners = pts
    .slice(1, -1)
    .sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x));
  return {
    candidate,
    valid: isValidCandidate(pts, from, to),
    bends: pts.length - 2,
    length,
    corners,
  };
}

const sameLength = (a: number, b: number): boolean =>
  Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

/**
 * Order of preference: fewest bends, shortest length, family order (straight, L,
 * midpoint S, escape connectors), then the corners ordered by (y, x) compared in turn,
 * which puts a route above before one below and, at equal heights, left before right.
 */
export function compareScored(a: Scored, b: Scored): number {
  if (a.bends !== b.bends) return a.bends - b.bends;
  if (!sameLength(a.length, b.length)) return a.length - b.length;
  const fa = FAMILIES.indexOf(a.candidate.family);
  const fb = FAMILIES.indexOf(b.candidate.family);
  if (fa !== fb) return fa - fb;
  const n = Math.min(a.corners.length, b.corners.length);
  for (let i = 0; i < n; i++) {
    const p = a.corners[i] as Point<W>;
    const q = b.corners[i] as Point<W>;
    if (p.y !== q.y) return p.y - q.y;
    if (p.x !== q.x) return p.x - q.x;
  }
  return 0;
}

/**
 * The best valid candidate, or (with `valid: false`) the best candidate ignoring
 * validity when none is valid. The first of equals in list order wins.
 */
export function chooseCandidate(scored: readonly Scored[]): Scored | undefined {
  let best: Scored | undefined;
  let fallback: Scored | undefined;
  for (const s of scored) {
    if (!fallback || compareScored(s, fallback) < 0) fallback = s;
    if (s.valid && (!best || compareScored(s, best) < 0)) best = s;
  }
  return best ?? fallback;
}
