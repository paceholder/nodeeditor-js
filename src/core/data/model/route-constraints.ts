/** Helpers for route constraints. Pure data, no route-kind knowledge. */
import type { RouteConstraint } from "./records.js";

/** An empty list is stored as absent. */
export function normalizeRoute(
  route: readonly RouteConstraint[] | undefined,
): readonly RouteConstraint[] | undefined {
  return route && route.length > 0 ? route : undefined;
}

/**
 * Shift constraints by a world offset: vertical pins move by `dx`, horizontal pins by
 * `dy`. Returns the same array when nothing changes.
 */
export function translateConstraints(
  route: readonly RouteConstraint[],
  dx: number,
  dy: number,
): readonly RouteConstraint[] {
  return route.map((c) => {
    const delta = c.orientation === "vertical" ? dx : dy;
    return delta === 0 ? c : { ...c, at: c.at + delta };
  });
}
