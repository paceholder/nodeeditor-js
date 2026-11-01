/**
 * Candidate shapes of an orthogonal route (D4 steps 2 and 3).
 *
 * A fixed list, built in a fixed order from the two ends: no search, no state, no
 * iteration over maps. Each candidate is a vertex list from `p0` to `p1`,
 * simplified (zero-length segments dropped, straight-through vertices merged; a reversal
 * is kept so the check can reject it).
 */
import type { Point, Rect } from "../geometry/spaces.js";
import type { Axis } from "./escape.js";

type W = "world";

/** Candidate families in tie-break order. */
export const FAMILIES = ["straight", "l", "midpoint-s", "escape"] as const;
export type Family = (typeof FAMILIES)[number];

export interface Candidate {
  readonly family: Family;
  readonly points: readonly Point<W>[];
}

/** One end with its snapped escape direction. */
export interface OrthogonalEnd {
  readonly position: Point<W>;
  readonly dir: Axis;
  readonly body: Rect<W> | undefined;
}

/** Ports within this distance of a common line count as aligned (world units). */
export const ALIGN_TOLERANCE = 1e-6;

const pt = (x: number, y: number): Point<W> => ({ x, y });
const along = (from: Point<W>, to: Point<W>, d: Axis): number =>
  (to.x - from.x) * d.x + (to.y - from.y) * d.y;

/** Drop repeated points and merge vertices where the direction does not change. */
export function simplify(points: readonly Point<W>[]): Point<W>[] {
  const out: Point<W>[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && last.x === p.x && last.y === p.y) continue;
    const prev = out[out.length - 2];
    if (prev && last) {
      const ax = last.x - prev.x;
      const ay = last.y - prev.y;
      const bx = p.x - last.x;
      const by = p.y - last.y;
      if (ax * by - ay * bx === 0 && ax * bx + ay * by > 0) out.pop();
    }
    out.push(p);
  }
  if (out.length === 1) out.push(out[0] as Point<W>);
  return out;
}

/** Union of the bodies that exist, or undefined. */
function union(a: Rect<W> | undefined, b: Rect<W> | undefined) {
  if (!a || !b) return a ?? b;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    w: Math.max(a.x + a.w, b.x + b.w) - x,
    h: Math.max(a.y + a.h, b.y + b.h) - y,
  };
}

/** Middle of the gap between two body spans on one axis when wider than `2c`. */
function gapMiddle(
  a0: number,
  a1: number,
  b0: number,
  b1: number,
  c: number,
): number | undefined {
  if (b0 - a1 > 2 * c) return (a1 + b0) / 2;
  if (a0 - b1 > 2 * c) return (b1 + a0) / 2;
  return undefined;
}

/** Middle-segment coordinates on one axis: escape points, their midpoint, gap, around. */
function middles(
  e0: number,
  e1: number,
  span0: readonly [number, number] | undefined,
  span1: readonly [number, number] | undefined,
  around: readonly [number, number] | undefined,
  c: number,
): number[] {
  const out = [e0, e1, (e0 + e1) / 2];
  if (span0 && span1) {
    const gap = gapMiddle(span0[0], span0[1], span1[0], span1[1], c);
    if (gap !== undefined) out.push(gap);
  }
  if (around) out.push(around[0] - c, around[1] + c);
  return out;
}

const xSpan = (r: Rect<W> | undefined) =>
  r ? ([r.x, r.x + r.w] as const) : undefined;
const ySpan = (r: Rect<W> | undefined) =>
  r ? ([r.y, r.y + r.h] as const) : undefined;

/** All candidates for the two ends with clearance `c`, in family order. */
export function orthogonalCandidates(
  a: OrthogonalEnd,
  b: OrthogonalEnd,
  c: number,
): Candidate[] {
  const p0 = a.position;
  const p1 = b.position;
  const d0 = a.dir;
  const d1 = b.dir;
  const out: Candidate[] = [];
  const add = (family: Family, points: Point<W>[]) =>
    out.push({ family, points: simplify(points) });
  const horizontal = d0.x !== 0;
  const facing = d0.x === -d1.x && d0.y === -d1.y;

  // Straight: facing, aligned, and the target ahead.
  const offset = horizontal ? p1.y - p0.y : p1.x - p0.x;
  if (facing && Math.abs(offset) <= ALIGN_TOLERANCE && along(p0, p1, d0) > 0)
    add("straight", [p0, p1]);

  // L: perpendicular escapes meeting at least `c` ahead of each port.
  if (d0.x * d1.x + d0.y * d1.y === 0) {
    const k = horizontal ? pt(p1.x, p0.y) : pt(p0.x, p1.y);
    const reach0 = along(p0, k, d0);
    const reach1 = along(p1, k, d1);
    if (reach0 >= c && reach1 >= c && reach0 > 0 && reach1 > 0)
      add("l", [p0, k, p1]);
  }

  // Midpoint S: facing ports, middle segment halfway between them (also the port escape and clearance rule's
  // close facing ports, whose escapes shrink to half the distance).
  if (facing) {
    const m = horizontal ? (p0.x + p1.x) / 2 : (p0.y + p1.y) / 2;
    const k0 = horizontal ? pt(m, p0.y) : pt(p0.x, m);
    const k1 = horizontal ? pt(m, p1.y) : pt(p1.x, m);
    if (along(p0, k0, d0) > 0 && along(p1, k1, d1) > 0)
      add("midpoint-s", [p0, k0, k1, p1]);
  }

  // Escape connectors: leave by `c`, then one corner or a middle segment.
  const e0 = pt(p0.x + d0.x * c, p0.y + d0.y * c);
  const e1 = pt(p1.x + d1.x * c, p1.y + d1.y * c);
  add("escape", [p0, e0, pt(e0.x, e1.y), e1, p1]);
  add("escape", [p0, e0, pt(e1.x, e0.y), e1, p1]);
  const around = union(a.body, b.body);
  const xs = middles(
    e0.x,
    e1.x,
    xSpan(a.body),
    xSpan(b.body),
    xSpan(around),
    c,
  );
  for (const x of xs) add("escape", [p0, e0, pt(x, e0.y), pt(x, e1.y), e1, p1]);
  const ys = middles(
    e0.y,
    e1.y,
    ySpan(a.body),
    ySpan(b.body),
    ySpan(around),
    c,
  );
  for (const y of ys) add("escape", [p0, e0, pt(e0.x, y), pt(e1.x, y), e1, p1]);
  return out;
}
