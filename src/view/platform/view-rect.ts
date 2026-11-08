/** A rectangle in client (page viewport) CSS pixels, as plain data. */
import { type Rect, type Viewport, worldToViewport } from "../../core/index.js";

/**
 * A rectangle in client (page viewport) CSS pixels, as plain data shaped like a
 * `DOMRect`: a popover library can take it as a virtual reference element, for example
 * `{ getBoundingClientRect: () => view.nodeRect(id) }`, with no adapter.
 */
export interface ViewRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly top: number;
  readonly left: number;
  readonly right: number;
  readonly bottom: number;
}

/** A rectangle from its top-left corner and size; the edge fields follow from them. */
export function viewRect(
  x: number,
  y: number,
  width: number,
  height: number,
): ViewRect {
  return {
    x,
    y,
    width,
    height,
    top: y,
    left: x,
    right: x + width,
    bottom: y + height,
  };
}

/** A world rectangle on screen: the viewport transform plus the container's client origin. */
export function clientRectOf(
  bounds: Rect<"world">,
  viewport: Viewport,
  origin: { readonly left: number; readonly top: number },
): ViewRect {
  const at = worldToViewport(viewport, { x: bounds.x, y: bounds.y });
  return viewRect(
    origin.left + at.x,
    origin.top + at.y,
    bounds.w * viewport.zoom,
    bounds.h * viewport.zoom,
  );
}
