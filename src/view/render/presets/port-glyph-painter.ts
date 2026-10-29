/**
 * Port glyph preset. Draws a circle or square at the anchor (the
 * theme's `portShape`) and, when the detail level allows secondary labels, the port's
 * label just inside the node, upright whatever the node rotation. Independent of node
 * painters and geometry: it only receives the anchor position and outward normal.
 */
import type { PortGlyphPainter } from "../registries/painter-types.js";

export interface PortGlyphOptions {
  /** Label font in world units; default a small system font. */
  readonly labelFont?: string;
  /** Extra gap between the glyph and its label, in world units. */
  readonly labelGap?: number;
}

export function createPortGlyphPainter(
  options: PortGlyphOptions = {},
): PortGlyphPainter {
  const font = options.labelFont ?? "11px system-ui, sans-serif";
  const gap = options.labelGap ?? 4;
  return {
    paint(ctx, { port, position, normal, style, detail, unit }) {
      const r = style.portRadius * unit;
      ctx.beginPath();
      if (style.portShape === "square") {
        ctx.rect(position.x - r, position.y - r, 2 * r, 2 * r);
      } else {
        ctx.arc(position.x, position.y, r, 0, Math.PI * 2);
      }
      ctx.fillStyle = style.portFill;
      ctx.fill();
      ctx.lineWidth = unit;
      ctx.strokeStyle = style.portStroke;
      ctx.stroke();

      if (!detail.secondaryLabels || !port.label) return;
      // The label sits on the inward side of the anchor.
      const off = r + gap * unit;
      const x = position.x - normal.x * off;
      const y = position.y - normal.y * off;
      ctx.fillStyle = style.textColor;
      ctx.font = font;
      if (Math.abs(normal.x) >= Math.abs(normal.y)) {
        ctx.textAlign = normal.x < 0 ? "left" : "right";
        ctx.textBaseline = "middle";
      } else {
        ctx.textAlign = "center";
        ctx.textBaseline = normal.y < 0 ? "top" : "bottom";
      }
      ctx.fillText(port.label, x, y);
    },
  };
}
