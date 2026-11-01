/**
 * Escape directions of an orthogonal route (ROU-01c, ROU-04).
 *
 * The outward normal is snapped to the nearer axis, horizontal on a tie. A zero or
 * non-finite normal uses the outward direction of the body side nearest the anchor (ties
 * in the order right, bottom, left, top); without a body, or with the anchor at the body
 * centre, the dominant axis toward the other end (horizontal on a tie, +x when the ends
 * coincide). Port direction (input, output, undirected) is never read.
 */
import type { Point, Rect } from "../geometry/spaces.js";

type W = "world";

/** A unit axis vector. */
export type Axis = Point<W>;

const PLUS_X: Axis = { x: 1, y: 0 };

/** The axis of `v` with the larger magnitude (horizontal on a tie); undefined for zero. */
function snap(v: Point<W>): Axis | undefined {
  if (!Number.isFinite(v.x) || !Number.isFinite(v.y)) return undefined;
  const ax = Math.abs(v.x);
  const ay = Math.abs(v.y);
  if (ax === 0 && ay === 0) return undefined;
  return ax >= ay ? { x: Math.sign(v.x), y: 0 } : { x: 0, y: Math.sign(v.y) };
}

function nearestSide(at: Point<W>, body: Rect<W>): Axis | undefined {
  const cx = body.x + body.w / 2;
  const cy = body.y + body.h / 2;
  if (at.x === cx && at.y === cy) return undefined;
  const sides: readonly [number, Axis][] = [
    [Math.abs(body.x + body.w - at.x), { x: 1, y: 0 }],
    [Math.abs(body.y + body.h - at.y), { x: 0, y: 1 }],
    [Math.abs(at.x - body.x), { x: -1, y: 0 }],
    [Math.abs(at.y - body.y), { x: 0, y: -1 }],
  ];
  let best: [number, Axis] | undefined;
  for (const side of sides) if (!best || side[0] < best[0]) best = side;
  return best && Number.isFinite(best[0]) ? best[1] : undefined;
}

/**
 * Escape direction of one end: `normal` snapped to an axis, else the nearest body side,
 * else toward `other`, else +x.
 */
export function escapeDirection(
  at: Point<W>,
  normal: Point<W>,
  body: Rect<W> | undefined,
  other: Point<W>,
): Axis {
  return (
    snap(normal) ??
    (body ? nearestSide(at, body) : undefined) ??
    snap({ x: other.x - at.x, y: other.y - at.y }) ??
    PLUS_X
  );
}
