/**
 * Card node preset painter (PRE-02, REN-01). A rounded body with a title bar; the title
 * is fitted to the bar with cached text measurement and an optional secondary label sits
 * at the bar's right end. The bar height must match the card geometry's `titleHeight`
 * (both default to 28). Port labels are drawn by the port glyph preset, which receives
 * each port's anchor from the scene, so this painter needs no port data.
 */
import type { NodeRecord } from "../../../core/index.js";
import type { NodePainter } from "../registries/painter-types.js";
import { payloadString } from "./image-symbol-painter.js";
import { createTextMeasurer } from "./text-measure.js";

export interface CardPainterOptions {
  readonly titleHeight?: number;
  /** Secondary label of a node; defaults to a string `subtitle` field of its payload. */
  readonly secondaryOf?: (node: NodeRecord) => string | undefined;
  readonly secondaryFont?: string;
}

const PAD = 8;

export function createCardPainter(
  options: CardPainterOptions = {},
): NodePainter {
  const barH = options.titleHeight ?? 28;
  const secondaryOf =
    options.secondaryOf ?? ((n) => payloadString(n.payload, "subtitle"));
  const secondaryFont = options.secondaryFont ?? "11px system-ui, sans-serif";
  // Per painter instance, never module-level.
  const measurer = createTextMeasurer();
  return {
    paint(ctx, { node, bounds, style, detail, unit }) {
      ctx.beginPath();
      ctx.roundRect(bounds.x, bounds.y, bounds.w, bounds.h, style.nodeRadius);
      ctx.fillStyle = style.nodeFill;
      ctx.fill();

      // Title bar: the body's rounded top, clipped.
      ctx.save();
      ctx.clip();
      ctx.fillStyle = style.nodeStroke;
      ctx.globalAlpha = 0.28;
      ctx.fillRect(bounds.x, bounds.y, bounds.w, Math.min(barH, bounds.h));
      ctx.restore();

      ctx.lineWidth = style.nodeLineWidth * unit;
      ctx.strokeStyle = style.nodeStroke;
      ctx.beginPath();
      ctx.roundRect(bounds.x, bounds.y, bounds.w, bounds.h, style.nodeRadius);
      ctx.stroke();

      if (!detail.title) return;
      const midY = bounds.y + barH / 2;
      const secondary = detail.secondaryLabels ? secondaryOf(node) : undefined;
      ctx.textBaseline = "middle";
      let titleRoom = bounds.w - 2 * PAD;
      if (secondary) {
        ctx.font = secondaryFont;
        const text = measurer.fit(ctx, secondary, bounds.w * 0.4);
        ctx.fillStyle = style.textColor;
        ctx.globalAlpha = 0.7;
        ctx.textAlign = "right";
        ctx.fillText(text, bounds.x + bounds.w - PAD, midY);
        ctx.globalAlpha = 1;
        titleRoom -= measurer.width(ctx, text) + PAD;
      }
      if (node.title) {
        ctx.font = style.font;
        ctx.fillStyle = style.textColor;
        ctx.textAlign = "left";
        ctx.fillText(
          measurer.fit(ctx, node.title, Math.max(0, titleRoom)),
          bounds.x + PAD,
          midY,
        );
      }
    },
  };
}
