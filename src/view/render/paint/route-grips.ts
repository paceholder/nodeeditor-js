/**
 * Route grips (ROU-03c, D8): a small square at each handle of a selected connection whose
 * kind has a route editor. A pinned handle is filled, a free one outlined. Sizes are in
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
): void {
  const size = GRIP_SIZE_PX * unit;
  ctx.save();
  ctx.lineWidth = GRIP_LINE_PX * unit;
  ctx.strokeStyle = theme.selection;
  for (const handle of editor.handles(entry)) {
    ctx.beginPath();
    ctx.rect(handle.at.x - size / 2, handle.at.y - size / 2, size, size);
    ctx.fillStyle = handle.pinned ? theme.selection : theme.background;
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}
