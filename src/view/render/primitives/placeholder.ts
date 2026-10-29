/**
 * Placeholder painter (NOD-07, AST-04, SAFE-02): what a node looks like when its type has
 * no registered painter or its picture could not be loaded. A hatched, dashed box with a
 * mark and a label, drawn over the node's real bounds so ports and connections stay
 * where the geometry puts them. It only draws: the node record is never touched.
 */
import type { Rect } from "../../../core/index.js";
import type { DetailPolicy } from "../paint/level-of-detail.js";
import type { NodePainter } from "../registries/painter-types.js";
import type { ResolvedStyle } from "../theme/resolve-style.js";

const HATCH_GAP = 10;

export interface PlaceholderLook {
  /** Single glyph in the middle: "?" for unknown types, "!" for missing assets. */
  readonly mark: string;
  readonly label?: string | undefined;
}

/** Context transform: node-local space. */
export function drawPlaceholder(
  ctx: CanvasRenderingContext2D,
  bounds: Rect<"local">,
  style: ResolvedStyle,
  detail: DetailPolicy,
  unit: number,
  look: PlaceholderLook,
): void {
  ctx.beginPath();
  ctx.roundRect(bounds.x, bounds.y, bounds.w, bounds.h, style.nodeRadius);
  ctx.fillStyle = style.nodeFill;
  ctx.fill();
  if (detail.level !== "minimal") {
    ctx.save();
    ctx.clip();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = style.nodeStroke;
    ctx.lineWidth = unit;
    ctx.beginPath();
    const span = bounds.w + bounds.h;
    for (let d = HATCH_GAP; d < span; d += HATCH_GAP) {
      ctx.moveTo(bounds.x + d, bounds.y);
      ctx.lineTo(bounds.x + d - bounds.h, bounds.y + bounds.h);
    }
    ctx.stroke();
    ctx.restore();
  }
  ctx.setLineDash([6 * unit, 4 * unit]);
  ctx.lineWidth = style.nodeLineWidth * unit;
  ctx.strokeStyle = style.nodeStroke;
  ctx.beginPath();
  ctx.roundRect(bounds.x, bounds.y, bounds.w, bounds.h, style.nodeRadius);
  ctx.stroke();
  ctx.setLineDash([]);

  const cx = bounds.x + bounds.w / 2;
  const cy = bounds.y + bounds.h / 2;
  ctx.fillStyle = style.textColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold ${Math.max(12, Math.min(bounds.w, bounds.h) / 3)}px system-ui, sans-serif`;
  ctx.fillText(look.mark, cx, cy);
  if (detail.title && look.label) {
    ctx.font = style.font;
    ctx.fillText(look.label, cx, bounds.y + bounds.h - 10, bounds.w - 8);
  }
}

/** Painter for node types nobody registered a painter for. */
export const placeholderNodePainter: NodePainter = {
  paint(ctx, { node, bounds, style, detail, unit }) {
    drawPlaceholder(ctx, bounds, style, detail, unit, {
      mark: "?",
      label: node.title ?? node.type,
    });
  },
};
