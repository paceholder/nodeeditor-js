/**
 * Resize handle geometry (D7), shared by the handle painter and the
 * resize tool, so what is drawn is exactly what is picked.
 *
 * The handle sits on the corner of the node's size box that is bottom-right on screen,
 * whatever the rotation and mirroring: the four local corners `(±w/2, ±h/2)` are mapped
 * through the entry's `toWorld` and the one with the largest `x + y` wins (unique for
 * quarter turns, since the box stays axis-aligned). It is a square of `RESIZE_HANDLE_PX`
 * CSS pixels inside the body with its outer corner on the body corner, independent of
 * zoom. Picking is geometric: a world point inside that square.
 */
import {
  applyPoint,
  type NodeEntry,
  type Point,
  type Rect,
  rect,
  rectContainsPoint,
} from "../../../../core/index.js";

/** Side of the handle square, CSS pixels. */
export const RESIZE_HANDLE_PX = 8;

/** A corner of the unrotated body box: `-1` left or top, `1` right or bottom. */
export interface LocalCorner {
  readonly x: -1 | 1;
  readonly y: -1 | 1;
}

export interface ResizeHandle {
  /** The local corner that carries the handle; a resize keeps its negation fixed. */
  readonly corner: LocalCorner;
  /** That corner of the body in world space: the screen bottom-right corner. */
  readonly point: Point<"world">;
  /** The handle square in world space, inside the body. */
  readonly rect: Rect<"world">;
}

const CORNERS: readonly LocalCorner[] = [
  { x: -1, y: -1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: 1, y: 1 },
];

export function resizeHandleOf(
  entry: Pick<NodeEntry, "record" | "toWorld">,
  zoom: number,
): ResizeHandle {
  const { width, height } = entry.record.size;
  let best: { corner: LocalCorner; point: Point<"world"> } | undefined;
  for (const corner of CORNERS) {
    const point = applyPoint(entry.toWorld, {
      x: (corner.x * width) / 2,
      y: (corner.y * height) / 2,
    });
    if (!best || point.x + point.y > best.point.x + best.point.y) {
      best = { corner, point };
    }
  }
  const chosen = best ?? { corner: { x: 1, y: 1 }, point: { x: 0, y: 0 } };
  const side = RESIZE_HANDLE_PX / zoom;
  return {
    ...chosen,
    rect: rect(chosen.point.x - side, chosen.point.y - side, side, side),
  };
}

/** Whether a world point lies on the handle square. */
export function hitsResizeHandle(
  handle: ResizeHandle,
  world: Point<"world">,
): boolean {
  return rectContainsPoint(handle.rect, world);
}
