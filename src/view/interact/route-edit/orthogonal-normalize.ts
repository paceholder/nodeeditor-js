/**
 * Redundant pin removal (D12). A pin is redundant when routing without it gives
 * the same vertices. Pins the router could not realize (-1) are tried first, then the
 * rest in walk order, each against the list reduced so far. The router is the caller's
 * `reroute`, so this file knows nothing of route registries.
 */
import {
  type ConnectionEntry,
  type Point,
  polylineVertices,
  type RouteConstraint,
} from "../../../core/index.js";
import type { RouteEditContext } from "../../render/registries/route-editor-registry.js";

type W = "world";

const SAME = 1e-6;

/**
 * The corners of the routed path: repeated points (a collapsed pin leaves a zero-length
 * segment) and points on a straight run are not corners, so they do not count as a
 * difference between two routes.
 */
function verticesOf(
  entry: ConnectionEntry | undefined,
): Point<W>[] | undefined {
  if (entry?.path?.kind !== "polyline") return undefined;
  const close = (a: number, b: number): boolean => Math.abs(a - b) < SAME;
  const out: Point<W>[] = [];
  for (const p of polylineVertices(entry.path)) {
    const last = out[out.length - 1];
    if (last && close(last.x, p.x) && close(last.y, p.y)) continue;
    const prev = out[out.length - 2];
    const straight =
      last &&
      prev &&
      ((close(prev.x, last.x) && close(last.x, p.x)) ||
        (close(prev.y, last.y) && close(last.y, p.y)));
    if (straight) out[out.length - 1] = p;
    else out.push(p);
  }
  return out;
}

function sameVertices(a: readonly Point<W>[], b: readonly Point<W>[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (p, i) =>
        Math.abs(p.x - (b[i] as Point<W>).x) < SAME &&
        Math.abs(p.y - (b[i] as Point<W>).y) < SAME,
    )
  );
}

/** `pins` without the constraints that change nothing; unchanged when not routable. */
export function dropRedundantPins(
  entry: ConnectionEntry,
  pins: readonly RouteConstraint[],
  context: RouteEditContext,
): readonly RouteConstraint[] {
  const routed = context.reroute(entry, pins);
  const target = verticesOf(routed);
  if (!routed || !target) return pins;
  const unrealized = (routed.realized ?? []).map((i) => i < 0);
  // Try the unrealized pins first, then the others, always in list (walk) order.
  const indices = pins.map((_, k) => k);
  const order = [
    ...indices.filter((k) => unrealized[k]),
    ...indices.filter((k) => !unrealized[k]),
  ];
  let kept = pins.map((pin, k) => ({ pin, k }));
  for (const k of order) {
    if (!kept.some((c) => c.k === k)) continue;
    const without = kept.filter((c) => c.k !== k);
    const candidate = verticesOf(
      context.reroute(
        entry,
        without.map((c) => c.pin),
      ),
    );
    if (candidate && sameVertices(candidate, target)) kept = without;
  }
  return kept.map((c) => c.pin);
}
