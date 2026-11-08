/**
 * Where an element attached to a node sits relative to the node's body bounds.
 * Pure: the result is a point in viewport pixels plus the fraction of the element's own
 * size to shift back by, so the host element's size never has to be measured.
 */
import {
  type Point,
  type Rect,
  type Viewport,
  worldToViewport,
} from "../../../core/index.js";

/**
 * Four edges and the centre sit the element outside the node, centred on that edge (the
 * centre sits it on the middle). Four corners pin the element's same corner to the node's
 * corner, so the element lies inside the body; `"top-left"` is the default.
 */
export type OverlayPlacement =
  | "top-left"
  | "top"
  | "top-right"
  | "left"
  | "center"
  | "right"
  | "bottom-left"
  | "bottom"
  | "bottom-right";

export interface PlacementResult {
  /** Reference point in viewport pixels. */
  readonly at: Point<"viewport">;
  /** Fraction of the element's own size to move it by (-1 is one full size up or left). */
  readonly shiftX: number;
  readonly shiftY: number;
}

/**
 * `offset` is a gap in CSS pixels that stays constant at any zoom. It separates the
 * element from the body for the four edge placements; corners and "center" ignore it.
 */
export function placeAtNode(
  bounds: Rect<"world">,
  viewport: Viewport,
  placement: OverlayPlacement = "top-left",
  offset = 0,
): PlacementResult {
  const topLeft = worldToViewport(viewport, { x: bounds.x, y: bounds.y });
  const w = bounds.w * viewport.zoom;
  const h = bounds.h * viewport.zoom;
  const cx = topLeft.x + w / 2;
  const cy = topLeft.y + h / 2;
  switch (placement) {
    case "top-left":
      return { at: topLeft, shiftX: 0, shiftY: 0 };
    case "top-right":
      return { at: { x: topLeft.x + w, y: topLeft.y }, shiftX: -1, shiftY: 0 };
    case "bottom-left":
      return { at: { x: topLeft.x, y: topLeft.y + h }, shiftX: 0, shiftY: -1 };
    case "bottom-right":
      return {
        at: { x: topLeft.x + w, y: topLeft.y + h },
        shiftX: -1,
        shiftY: -1,
      };
    case "top":
      return { at: { x: cx, y: topLeft.y - offset }, shiftX: -0.5, shiftY: -1 };
    case "bottom":
      return {
        at: { x: cx, y: topLeft.y + h + offset },
        shiftX: -0.5,
        shiftY: 0,
      };
    case "left":
      return { at: { x: topLeft.x - offset, y: cy }, shiftX: -1, shiftY: -0.5 };
    case "right":
      return {
        at: { x: topLeft.x + w + offset, y: cy },
        shiftX: 0,
        shiftY: -0.5,
      };
    case "center":
      return { at: { x: cx, y: cy }, shiftX: -0.5, shiftY: -0.5 };
  }
}
