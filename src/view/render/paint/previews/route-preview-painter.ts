/**
 * Route preview painter (ROU-03c, D8): the dragged connection re-routed through the
 * tentative constraints, drawn on the interaction layer with the scene's connection
 * painter, selection outline and grips. The scene layer skips the connection while this
 * preview is active, so a pointer move repaints this layer only. Context starts in world
 * space.
 */
import type { PaintFrame } from "../../primitives/frame.js";
import { paintEntries } from "../scene-layer.js";
import { ghostWithRoute } from "./ghost-entries.js";
import type { MovePreviewDeps } from "./move-preview-painter.js";
import type { ToolPreview } from "./preview-types.js";

type RoutePreview = Extract<ToolPreview, { kind: "route" }>;

export function paintRoutePreview(
  ctx: CanvasRenderingContext2D,
  deps: MovePreviewDeps,
  frame: PaintFrame,
  preview: RoutePreview,
): void {
  const ghost = ghostWithRoute(preview.connection, preview.route, deps);
  if (ghost) paintEntries(ctx, deps, frame, [], [ghost]);
}
