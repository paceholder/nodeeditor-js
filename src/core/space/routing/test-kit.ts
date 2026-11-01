/** Test helpers for routers: end builders and shape checks. */
import type { PathGeometry } from "../geometry/path-geometry.js";
import type { Point, Rect } from "../geometry/spaces.js";
import type { RouteEnd } from "./route-types.js";

type W = "world";

export const w = (x: number, y: number): Point<W> => ({ x, y });
export const box = (x: number, y: number, bw: number, bh: number): Rect<W> => ({
  x,
  y,
  w: bw,
  h: bh,
});

export const RIGHT = w(1, 0);
export const LEFT = w(-1, 0);
export const UP = w(0, -1);
export const DOWN = w(0, 1);

export function end(
  position: Point<W>,
  normal: Point<W>,
  body?: Rect<W>,
): RouteEnd {
  return { position, normal, body };
}

/** Every vertex of a path in order (endpoints included). */
export function verticesOf(path: PathGeometry): Point<W>[] {
  if (path.kind === "polyline") return [path.p0, ...path.via, path.p1];
  if (path.kind === "line") return [path.p0, path.p1];
  return [path.p0, path.c1, path.c2, path.p1];
}

export function isAxisAligned(path: PathGeometry): boolean {
  const v = verticesOf(path);
  for (let i = 1; i < v.length; i++) {
    const a = v[i - 1] as Point<W>;
    const b = v[i] as Point<W>;
    if (a.x !== b.x && a.y !== b.y) return false;
  }
  return true;
}
