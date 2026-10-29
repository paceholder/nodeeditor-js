/**
 * Port placement helpers shared by the presets and the placeholder geometry.
 *
 * Side assignment: input -> left (top when vertical), output -> right (bottom when
 * vertical), undirected ports alternate between the two sides in model order, starting
 * with left/top. Ports on one side keep model order.
 */
import type { PortPlacement, PortRecord } from "../../data/model/records.js";
import type { Vec2 } from "../../data/model/values.js";
import { DEFAULT_CAPTURE_RADIUS_PX, type PortAnchor } from "./node-geometry.js";
import type { Point, Rect } from "./spaces.js";
import { normalize } from "./vec.js";

export type Side = "left" | "right" | "top" | "bottom";
export type Orientation = "horizontal" | "vertical";

type L = "local";

export function sideNormal(side: Side): Point<L> {
  switch (side) {
    case "left":
      return { x: -1, y: 0 };
    case "right":
      return { x: 1, y: 0 };
    case "top":
      return { x: 0, y: -1 };
    case "bottom":
      return { x: 0, y: 1 };
  }
}

/** Group ports by side in model order. Returns `[first, second]` side lists. */
export function assignSides(ports: readonly PortRecord[]): {
  readonly first: PortRecord[];
  readonly second: PortRecord[];
} {
  const first: PortRecord[] = [];
  const second: PortRecord[] = [];
  let flip = false;
  for (const port of ports) {
    if (port.direction === "input") first.push(port);
    else if (port.direction === "output") second.push(port);
    else {
      (flip ? second : first).push(port);
      flip = !flip;
    }
  }
  return { first, second };
}

export function sidesFor(orientation: Orientation): readonly [Side, Side] {
  return orientation === "horizontal" ? ["left", "right"] : ["top", "bottom"];
}

/** Point on `side` of `body`; `fraction` in [0, 1] runs along the side. */
export function pointOnSide(
  side: Side,
  body: Rect<L>,
  fraction: number,
): Point<L> {
  switch (side) {
    case "left":
      return { x: body.x, y: body.y + body.h * fraction };
    case "right":
      return { x: body.x + body.w, y: body.y + body.h * fraction };
    case "top":
      return { x: body.x + body.w * fraction, y: body.y };
    case "bottom":
      return { x: body.x + body.w * fraction, y: body.y + body.h };
  }
}

/** Normal of the body edge nearest to `p` (ties: left, right, top, bottom). */
export function nearestEdgeNormal(body: Rect<L>, p: Point<L>): Point<L> {
  const dist: readonly [Side, number][] = [
    ["left", Math.abs(p.x - body.x)],
    ["right", Math.abs(body.x + body.w - p.x)],
    ["top", Math.abs(p.y - body.y)],
    ["bottom", Math.abs(body.y + body.h - p.y)],
  ];
  let best = dist[0] as readonly [Side, number];
  for (const d of dist) if (d[1] < best[1]) best = d;
  return sideNormal(best[0]);
}

/** Anchor from a per-port or type-level placement (fractions of the unrotated body box). */
export function anchorFromPlacement(
  port: PortRecord,
  placement: PortPlacement,
  body: Rect<L>,
  captureRadiusPx: number = DEFAULT_CAPTURE_RADIUS_PX,
): PortAnchor {
  const position: Point<L> = {
    x: body.x + placement.x * body.w,
    y: body.y + placement.y * body.h,
  };
  const explicit: Vec2 | undefined = placement.normal;
  const fallback = nearestEdgeNormal(body, position);
  return {
    portId: port.id,
    position,
    normal: explicit ? normalize(explicit, fallback) : fallback,
    captureRadiusPx,
  };
}

/** Evenly spaced anchors along the two sides implied by direction. */
export function evenAnchors(
  ports: readonly PortRecord[],
  body: Rect<L>,
  orientation: Orientation,
  captureRadiusPx: number = DEFAULT_CAPTURE_RADIUS_PX,
): Map<string, PortAnchor> {
  const { first, second } = assignSides(ports);
  const [sideA, sideB] = sidesFor(orientation);
  const out = new Map<string, PortAnchor>();
  const place = (list: PortRecord[], side: Side): void => {
    list.forEach((port, i) => {
      out.set(port.id, {
        portId: port.id,
        position: pointOnSide(side, body, (i + 1) / (list.length + 1)),
        normal: sideNormal(side),
        captureRadiusPx,
      });
    });
  };
  place(first, sideA);
  place(second, sideB);
  return out;
}
