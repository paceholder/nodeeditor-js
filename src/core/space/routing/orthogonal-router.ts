/**
 * Orthogonal router (D4).
 *
 * Routing is a pure function of the two ends: snap each escape direction to an axis,
 * build a fixed candidate list, keep the valid ones, and choose by fewest bends, then
 * shortest, then fixed tie-breaks. With no valid candidate the best candidate is still
 * returned as a fallback, reported `unroutable` and clear of nothing. A valid route is
 * clear of its endpoint nodes only: unrelated nodes are not checked.
 *
 * The ends are put in a canonical order before routing and the result is reversed back,
 * so swapping `from` and `to` yields exactly the same vertices in reverse (the escape direction fallback rule,
 * The deterministic and stable routing rule), which an undirected connection relies on.
 */
import { type Polyline, polylinePath } from "../geometry/polyline.js";
import type { Point, Rect } from "../geometry/spaces.js";
import { escapeDirection } from "./escape.js";
import {
  type OrthogonalEnd,
  orthogonalCandidates,
} from "./orthogonal-candidates.js";
import { chooseCandidate, score } from "./orthogonal-check.js";
import type {
  ConnectionRoute,
  ConnectionRouter,
  RouteInput,
  RouteOutcome,
} from "./route-types.js";

export interface OrthogonalRouterOptions {
  /** Length of the escape segment at each port, world units. Default 20. */
  readonly clearance?: number;
  /** Corner radius, world units; 0 (default) gives sharp corners. */
  readonly cornerRadius?: number;
}

export const DEFAULT_CLEARANCE = 20;

const COMPLETE: RouteOutcome = {
  status: "complete",
  clearOf: "endpoint-nodes",
};
const UNROUTABLE: RouteOutcome = { status: "unroutable", clearOf: "nothing" };

type W = "world";

/** Lexicographic order of two ends; negative when `a` comes first. */
function compareEnds(a: OrthogonalEnd, b: OrthogonalEnd): number {
  const key = (e: OrthogonalEnd): number[] => [
    e.position.x,
    e.position.y,
    e.dir.x,
    e.dir.y,
    e.body ? 1 : 0,
    e.body?.x ?? 0,
    e.body?.y ?? 0,
    e.body?.w ?? 0,
    e.body?.h ?? 0,
  ];
  const ka = key(a);
  const kb = key(b);
  for (let i = 0; i < ka.length; i++) {
    const d = (ka[i] as number) - (kb[i] as number);
    if (d !== 0 && !Number.isNaN(d)) return d;
  }
  return 0;
}

function reversed(path: Polyline): Polyline {
  const base = { kind: "polyline", p0: path.p1, p1: path.p0 } as const;
  const via = [...path.via].reverse();
  return path.radii
    ? { ...base, via, radii: [...path.radii].reverse() }
    : { ...base, via };
}

function routeOrdered(
  from: OrthogonalEnd,
  to: OrthogonalEnd,
  clearance: number,
  radius: number,
): { readonly path: Polyline; readonly outcome: RouteOutcome } {
  const p0 = from.position;
  const p1 = to.position;
  if (p0.x === p1.x && p0.y === p1.y)
    return { path: polylinePath([p0, p1]), outcome: COMPLETE };
  const scored = orthogonalCandidates(from, to, clearance).map((c) =>
    score(c, from, to),
  );
  const best = chooseCandidate(scored);
  const points: readonly Point<W>[] = best?.candidate.points ?? [p0, p1];
  return {
    path: polylinePath(points, radius),
    outcome: best?.valid ? COMPLETE : UNROUTABLE,
  };
}

const nonNegative = (v: number | undefined, fallback: number): number =>
  v !== undefined && Number.isFinite(v) && v >= 0 ? v : fallback;

export function createOrthogonalRouter(
  options: OrthogonalRouterOptions = {},
): ConnectionRouter {
  const clearance = nonNegative(options.clearance, DEFAULT_CLEARANCE);
  const radius = nonNegative(options.cornerRadius, 0);
  const end = (
    position: Point<W>,
    normal: Point<W>,
    body: Rect<W> | undefined,
    other: Point<W>,
  ): OrthogonalEnd => ({
    position,
    dir: escapeDirection(position, normal, body, other),
    body,
  });
  return {
    route({ from, to }: RouteInput): ConnectionRoute {
      const a = end(from.position, from.normal, from.body, to.position);
      const b = end(to.position, to.normal, to.body, from.position);
      if (compareEnds(a, b) <= 0) return routeOrdered(a, b, clearance, radius);
      const back = routeOrdered(b, a, clearance, radius);
      return { path: reversed(back.path), outcome: back.outcome };
    },
  };
}
