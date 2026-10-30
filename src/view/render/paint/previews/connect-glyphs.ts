/**
 * Candidate-state glyphs for the connect preview (UX-02, PRT-06). Each state has its own
 * shape, so the meaning never relies on color alone: check, cross, ring, padlock,
 * hourglass. Drawn in CSS pixels around (0, 0); the caller translates first.
 */
import type { CandidateState } from "./preview-types.js";

export const GLYPH_RADIUS_PX = 9;

const SHAPES: Record<CandidateState, (ctx: CanvasRenderingContext2D) => void> =
  {
    compatible(ctx) {
      ctx.beginPath();
      ctx.moveTo(-4, 0.5);
      ctx.lineTo(-1, 3.5);
      ctx.lineTo(4.5, -3);
      ctx.stroke();
    },
    incompatible(ctx) {
      ctx.beginPath();
      ctx.moveTo(-3.5, -3.5);
      ctx.lineTo(3.5, 3.5);
      ctx.moveTo(3.5, -3.5);
      ctx.lineTo(-3.5, 3.5);
      ctx.stroke();
    },
    occupied(ctx) {
      ctx.beginPath();
      ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
      ctx.stroke();
    },
    unavailable(ctx) {
      ctx.beginPath();
      ctx.rect(-3.5, -0.5, 7, 5);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -0.5, 2.5, Math.PI, 0);
      ctx.stroke();
    },
    pending(ctx) {
      ctx.beginPath();
      ctx.moveTo(-3.5, -4);
      ctx.lineTo(3.5, -4);
      ctx.lineTo(-3.5, 4);
      ctx.lineTo(3.5, 4);
      ctx.closePath();
      ctx.stroke();
    },
  };

export function colorOf(
  state: CandidateState,
  theme: {
    readonly connectionColor: string;
    readonly error: string;
    readonly warning: string;
    readonly textColor: string;
  },
): string {
  switch (state) {
    case "compatible":
      return theme.connectionColor;
    case "incompatible":
      return theme.error;
    case "occupied":
    case "unavailable":
      return theme.warning;
    case "pending":
      return theme.textColor;
  }
}

export function drawGlyph(
  ctx: CanvasRenderingContext2D,
  state: CandidateState,
  color: string,
  background: string,
  occupiedMark: boolean,
): void {
  ctx.beginPath();
  ctx.arc(0, 0, GLYPH_RADIUS_PX, 0, Math.PI * 2);
  ctx.fillStyle = background;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  SHAPES[state](ctx);
  if (occupiedMark) {
    // A filled dot on the badge's rim: the port already carries connections.
    ctx.beginPath();
    ctx.arc(GLYPH_RADIUS_PX * 0.75, -GLYPH_RADIUS_PX * 0.75, 3, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
}
