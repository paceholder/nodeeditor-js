/**
 * Marquee painter. Containment draws a solid outline and intersection a
 * dashed one, so the mode is readable without color. Context starts in world space.
 */

import type { PaintFrame } from "../../primitives/frame.js";
import type { ToolPreview } from "./preview-types.js";

type MarqueePreview = Extract<ToolPreview, { kind: "marquee" }>;

const DASH_PX: readonly number[] = [6, 4];

export function paintMarquee(
  ctx: CanvasRenderingContext2D,
  frame: PaintFrame,
  preview: MarqueePreview,
): void {
  const { rect, mode } = preview;
  const unit = 1 / frame.viewport.zoom;
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = frame.theme.selection;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.lineWidth = frame.theme.selectionWidth * unit;
  ctx.strokeStyle = frame.theme.selection;
  ctx.setLineDash(mode === "intersect" ? DASH_PX.map((d) => d * unit) : []);
  ctx.stroke();
  ctx.setLineDash([]);
}
