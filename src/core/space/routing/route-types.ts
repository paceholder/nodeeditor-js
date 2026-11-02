/**
 * Router contract (ROU-01, ROU-06).
 *
 * A router turns the two ends of a connection into a path and an outcome. It is a pure,
 * synchronous function of its input; the input is a struct so later changes can add
 * fields (an obstacle query) without reshaping the output. Stored route constraints
 * (ROU-03a) arrive in `constraints`; a router that does not use them ignores them.
 */
import type { RouteConstraint } from "../../data/model/records.js";
import type { PathGeometry } from "../geometry/path-geometry.js";
import type { Point, Rect } from "../geometry/spaces.js";

type W = "world";

export interface RouteEnd {
  readonly position: Point<W>;
  /** Outward normal; may be zero, non-finite or diagonal. */
  readonly normal: Point<W>;
  /** The end node's body box; undefined for a free end (a connection drag). */
  readonly body: Rect<W> | undefined;
}

export interface RouteInput {
  readonly from: RouteEnd;
  readonly to: RouteEnd;
  /** The connection's route constraints in walk order; empty when none (ROU-03a). */
  readonly constraints: readonly RouteConstraint[];
}

/**
 * How a route turned out. `clearOf` names what the route was checked against and
 * avoids: `nothing`, or the connection's own endpoint nodes. No built-in route claims
 * more (ROU-05).
 */
export interface RouteOutcome {
  readonly status: "complete" | "provisional" | "unroutable";
  readonly clearOf: "nothing" | "endpoint-nodes";
}

export interface ConnectionRoute {
  readonly path: PathGeometry;
  readonly outcome: RouteOutcome;
  /**
   * For each constraint, the index of the path segment (between consecutive vertices of
   * `polylineVertices(path)`) that lies on it, or -1 when the router ignored it. Omitted
   * by routers that ignore constraints (ROU-03c).
   */
  readonly realized?: readonly number[];
}

export interface ConnectionRouter {
  route(input: RouteInput): ConnectionRoute;
}
