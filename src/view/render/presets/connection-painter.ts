/**
 * Connection preset. Strokes the path geometry (straight or cubic) in
 * world space and always draws endpoint dots exactly at the path ends, which are the
 * port anchors. An optional arrowhead marks the target end. Dashes can mark a kind.
 */
import { endTangents } from "../../../core/index.js";
import { tracePath } from "../primitives/trace-path.js";
import type { ConnectionPainter } from "../registries/painter-types.js";

export interface ConnectionPainterOptions {
  readonly arrowhead?: boolean;
  /** Dash pattern in multiples of the line width; solid when omitted. */
  readonly dash?: readonly [number, number];
}

export function createConnectionPainter(
  options: ConnectionPainterOptions = {},
): ConnectionPainter {
  return {
    paint(ctx, { path, style, unit }) {
      const w = style.connectionWidth * unit;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = w;
      ctx.strokeStyle = style.connectionColor;
      if (options.dash) {
        ctx.setLineDash([options.dash[0] * w, options.dash[1] * w]);
      }
      ctx.beginPath();
      tracePath(ctx, path);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = style.connectionColor;
      ctx.beginPath();
      ctx.arc(path.p0.x, path.p0.y, w * 1.25, 0, Math.PI * 2);
      ctx.arc(path.p1.x, path.p1.y, w * 1.25, 0, Math.PI * 2);
      ctx.fill();

      if (options.arrowhead) {
        const t = endTangents(path).end;
        const len = w * 5;
        const bx = path.p1.x - t.x * len;
        const by = path.p1.y - t.y * len;
        ctx.beginPath();
        ctx.moveTo(path.p1.x, path.p1.y);
        ctx.lineTo(bx - t.y * len * 0.45, by + t.x * len * 0.45);
        ctx.lineTo(bx + t.y * len * 0.45, by - t.x * len * 0.45);
        ctx.closePath();
        ctx.fill();
      }
    },
  };
}
