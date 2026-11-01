/**
 * Straight and cubic-Bezier routers. They check nothing, so their outcome is
 * complete and clear of nothing.
 */
import { bezierPath, straightPath } from "../geometry/connection-paths.js";
import type { ConnectionRouter, RouteOutcome } from "./route-types.js";

const UNCHECKED: RouteOutcome = { status: "complete", clearOf: "nothing" };

export function createStraightRouter(): ConnectionRouter {
  return {
    route: ({ from, to }) => ({
      path: straightPath(from.position, to.position),
      outcome: UNCHECKED,
    }),
  };
}

/** Handles follow the end normals (see `bezierPath`). */
export function createBezierRouter(): ConnectionRouter {
  return {
    route: ({ from, to }) => ({
      path: bezierPath(from.position, from.normal, to.position, to.normal),
      outcome: UNCHECKED,
    }),
  };
}
