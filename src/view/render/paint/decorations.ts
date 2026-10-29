/**
 * Decorations the scene layer draws itself, after the painter, at every detail level
 * (LAY-04): selection outlines and diagnostic badges. Keeping them out of painters means
 * a custom painter cannot lose them, and low detail cannot hide them.
 */
import type { PathGeometry, Rect } from "../../../core/index.js";
import { tracePath } from "../primitives/trace-path.js";
import type { DiagnosticBadge } from "../registries/painter-types.js";
import type { ThemeTokens } from "../theme/tokens.js";

const BADGE_RADIUS_PX = 5;
const SELECTION_GAP_PX = 3;

/** Map the free-form `status` field to badges. Unknown statuses draw nothing. */
export function diagnosticsOf(status: string | undefined): DiagnosticBadge[] {
  if (status === "error" || status === "warning") return [{ severity: status }];
  return [];
}

/** Context transform: node-local space. */
export function drawNodeSelection(
  ctx: CanvasRenderingContext2D,
  bounds: Rect<"local">,
  theme: ThemeTokens,
  unit: number,
): void {
  const g = SELECTION_GAP_PX * unit;
  ctx.beginPath();
  ctx.roundRect(
    bounds.x - g,
    bounds.y - g,
    bounds.w + 2 * g,
    bounds.h + 2 * g,
    theme.nodeRadius + g,
  );
  ctx.lineWidth = theme.selectionWidth * unit;
  ctx.strokeStyle = theme.selection;
  ctx.stroke();
}

/** Context transform: node-local space. Badges sit on the top-right corner. */
export function drawNodeBadges(
  ctx: CanvasRenderingContext2D,
  bounds: Rect<"local">,
  badges: readonly DiagnosticBadge[],
  theme: ThemeTokens,
  unit: number,
): void {
  const r = BADGE_RADIUS_PX * unit;
  let x = bounds.x + bounds.w;
  for (const badge of badges) {
    ctx.beginPath();
    ctx.arc(x, bounds.y, r, 0, Math.PI * 2);
    ctx.fillStyle = badge.severity === "error" ? theme.error : theme.warning;
    ctx.fill();
    x -= 2.5 * r;
  }
}

/** Context transform: world space. */
export function drawConnectionSelection(
  ctx: CanvasRenderingContext2D,
  path: PathGeometry,
  theme: ThemeTokens,
  unit: number,
): void {
  ctx.beginPath();
  tracePath(ctx, path);
  ctx.lineWidth = (theme.connectionWidth + 2 * theme.selectionWidth) * unit;
  ctx.lineCap = "round";
  ctx.strokeStyle = theme.selection;
  ctx.stroke();
}
