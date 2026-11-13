/**
 * Default group frame painter: a filled rounded rectangle, a border, the title in the
 * title strip and a padlock in the strip's corner. States differ by more than color:
 * the border is dashed when idle, solid and thicker when selected, and doubled while a
 * dragged node is about to join; the padlock is drawn closed or open.
 */
import type { Rect } from "../../../core/index.js";
import type { GroupFramePainter } from "../registries/painter-types.js";
import { createTextMeasurer } from "./text-measure.js";

const PAD = 8;

/** Padlock in `box`: a body, and a shackle that is lifted off one side when open. */
export function drawPadlock(
  ctx: CanvasRenderingContext2D,
  box: Rect<"world">,
  locked: boolean,
  lineWidth: number,
): void {
  const { x, y, w, h } = box;
  const bodyTop = y + h * 0.48;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.rect(x + w * 0.18, bodyTop, w * 0.64, h * 0.42);
  if (locked) ctx.fill();
  ctx.stroke();
  const radius = w * 0.2;
  ctx.beginPath();
  if (locked) {
    ctx.arc(x + w / 2, bodyTop, radius, Math.PI, 0);
  } else {
    // Open: the shackle swings to the right and its free end hangs in the air.
    ctx.arc(x + w / 2 + radius, bodyTop, radius, Math.PI, 0);
    ctx.lineTo(x + w / 2 + 2 * radius, bodyTop - h * 0.14);
  }
  ctx.stroke();
}

export function createGroupFramePainter(): GroupFramePainter {
  // Per painter instance, never module-level.
  const measurer = createTextMeasurer();
  return {
    paint(ctx, input) {
      const { group, frame, titleStrip, lockBox, style, theme, unit, state } =
        input;
      const outline = (inset: number): void => {
        ctx.beginPath();
        ctx.roundRect(
          frame.x + inset,
          frame.y + inset,
          Math.max(0, frame.w - 2 * inset),
          Math.max(0, frame.h - 2 * inset),
          Math.max(0, theme.groupRadius - inset),
        );
      };
      outline(0);
      ctx.fillStyle = style.groupFill;
      ctx.fill();

      if (state.joinTarget) {
        ctx.setLineDash([]);
        ctx.strokeStyle = theme.groupJoin;
        ctx.lineWidth = 2 * unit;
        ctx.stroke();
        outline(4 * unit);
        ctx.stroke();
      } else if (state.selected) {
        ctx.setLineDash([]);
        ctx.strokeStyle = theme.selection;
        ctx.lineWidth = theme.selectionWidth * unit;
        ctx.stroke();
      } else {
        ctx.setLineDash([6 * unit, 4 * unit]);
        ctx.strokeStyle = style.groupStroke;
        ctx.lineWidth = unit;
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (input.detail.level === "overview") return;
      ctx.strokeStyle = style.groupTitleColor;
      ctx.fillStyle = style.groupTitleColor;
      drawPadlock(ctx, lockBox, group.locked, 1.5 * unit);
      if (!input.detail.title || group.title === "") return;
      ctx.font = theme.font;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      const room = lockBox.x - titleStrip.x - 2 * PAD;
      ctx.fillText(
        measurer.fit(ctx, group.title, Math.max(0, room)),
        titleStrip.x + PAD,
        titleStrip.y + titleStrip.h / 2,
      );
    },
  };
}
