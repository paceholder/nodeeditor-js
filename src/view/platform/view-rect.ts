/** A rectangle in client (page viewport) CSS pixels, as plain data. */
import { type Rect, type Viewport, worldToViewport } from "../../core/index.js";

export interface ViewRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A world rectangle on screen: the viewport transform plus the container's client origin. */
export function clientRectOf(
  bounds: Rect<"world">,
  viewport: Viewport,
  origin: { readonly left: number; readonly top: number },
): ViewRect {
  const at = worldToViewport(viewport, { x: bounds.x, y: bounds.y });
  return {
    x: origin.left + at.x,
    y: origin.top + at.y,
    width: bounds.w * viewport.zoom,
    height: bounds.h * viewport.zoom,
  };
}
