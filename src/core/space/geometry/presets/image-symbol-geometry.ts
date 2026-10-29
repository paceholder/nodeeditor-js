/**
 * Image-symbol geometry preset (PRE-01, NOD-02, NOD-03, GEO-02b).
 *
 * The body is a rectangle of the stored size centered on the node origin. The hit shape is
 * that rectangle unless the type supplies an outline polygon. Port anchors resolve in
 * order: the port's durable placement; then the type-level placement; then even
 * distribution along the sides implied by direction. Without an explicit normal, the normal
 * points out of the nearest body edge.
 */
import type { PortPlacement, PortRecord } from "../../../data/model/records.js";
import type { Vec2 } from "../../../data/model/values.js";
import {
  DEFAULT_CAPTURE_RADIUS_PX,
  type NodeGeometry,
  type NodeView,
  type PortAnchor,
} from "../node-geometry.js";
import { anchorFromPlacement, evenAnchors } from "../port-layout.js";
import { inflateRect } from "../rect.js";
import { polygonShape, rectShape, type Shape } from "../shapes.js";
import { type Rect, rect } from "../spaces.js";

export interface ImageSymbolOptions {
  /** Outline polygon as fractions (0..1) of the body box; defaults to the body rectangle. */
  readonly outline?: readonly Vec2[];
  /** Type-level placement for ports without durable placement. */
  readonly typePlacement?: (
    port: PortRecord,
    index: number,
  ) => PortPlacement | undefined;
  readonly captureRadiusPx?: number;
  /** Extra painted margin around the body (shadow, glow) in world units. */
  readonly paintedMargin?: number;
}

export function bodyOf(view: NodeView): Rect<"local"> {
  const { width, height } = view.node.size;
  return rect(-width / 2, -height / 2, width, height);
}

export function createImageSymbolGeometry(
  options: ImageSymbolOptions = {},
): NodeGeometry {
  const radius = options.captureRadiusPx ?? DEFAULT_CAPTURE_RADIUS_PX;
  const margin = options.paintedMargin ?? 0;
  return {
    bodyBounds: bodyOf,
    hitShape(view): Shape {
      const body = bodyOf(view);
      if (options.outline) {
        const poly = polygonShape(
          options.outline.map((f) => ({
            x: body.x + f.x * body.w,
            y: body.y + f.y * body.h,
          })),
        );
        if (poly.ok) return poly.value;
      }
      return rectShape(body);
    },
    paintedBounds: (view) => inflateRect(bodyOf(view), margin),
    anchors(view): readonly PortAnchor[] {
      const body = bodyOf(view);
      const placed = new Map<string, PortAnchor>();
      const unplaced: PortRecord[] = [];
      view.ports.forEach((port, index) => {
        const placement =
          port.placement ?? options.typePlacement?.(port, index);
        if (placement) {
          placed.set(
            port.id,
            anchorFromPlacement(port, placement, body, radius),
          );
        } else unplaced.push(port);
      });
      const even = evenAnchors(unplaced, body, "horizontal", radius);
      return view.ports.flatMap((port) => {
        const anchor = placed.get(port.id) ?? even.get(port.id);
        return anchor ? [anchor] : [];
      });
    },
  };
}
