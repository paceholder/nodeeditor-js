/**
 * Route grips (D8, D11): a small square at each move handle of a
 * selected connection whose kind has a route editor, and a diamond at each split handle.
 * A pinned handle is filled, a free one (and every diamond) outlined. Sizes are in
 * screen pixels (`unit` converts), so grips keep their size at every zoom. Context
 * transform: world space.
 */
import type { ConnectionEntry } from "../../../core/index.js";
import type { RouteEditor } from "../registries/route-editor-registry.js";
import type { ThemeTokens } from "../theme/tokens.js";

const GRIP_SIZE_PX = 8;
const GRIP_LINE_PX = 1.5;

export function drawRouteGrips(
  ctx: CanvasRenderingContext2D,
  entry: ConnectionEntry,
  editor: RouteEditor,
  theme: ThemeTokens,
  unit: number,
  zoom: number,
): void {
  const size = GRIP_SIZE_PX * unit;
  ctx.save();
  ctx.lineWidth = GRIP_LINE_PX * unit;
  ctx.strokeStyle = theme.selection;
  const r = size / 2;
  for (const handle of editor.handles(entry, { zoom })) {
    const { x, y } = handle.at;
    ctx.beginPath();
    if (handle.role === "split") {
      // Slightly larger than the square so the diamond reads as a different handle.
      const d = r * 1.25;
      ctx.moveTo(x, y - d);
      ctx.lineTo(x + d, y);
      ctx.lineTo(x, y + d);
      ctx.lineTo(x - d, y);
      ctx.closePath();
    } else {
      ctx.rect(x - r, y - r, size, size);
    }
    ctx.fillStyle = handle.pinned ? theme.selection : theme.background;
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}
