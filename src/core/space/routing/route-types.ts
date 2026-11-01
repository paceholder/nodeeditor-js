/**
 * Router contract.
 *
 * A router turns the two ends of a connection into a path and an outcome. It is a pure,
 * synchronous function of its input; the input is a struct so later changes can add
 * fields (stored route constraints, an obstacle query) without reshaping the output.
 */
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
}

/**
 * How a route turned out. `clearOf` names what the route was checked against and
 * avoids: `nothing`, or the connection's own endpoint nodes. No built-in route claims
 * more.
 */
export interface RouteOutcome {
  readonly status: "complete" | "provisional" | "unroutable";
  readonly clearOf: "nothing" | "endpoint-nodes";
}

export interface ConnectionRoute {
  readonly path: PathGeometry;
  readonly outcome: RouteOutcome;
}

export interface ConnectionRouter {
  route(input: RouteInput): ConnectionRoute;
}
