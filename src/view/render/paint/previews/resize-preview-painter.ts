/**
 * Resize preview painter (D8): the node at the preview size and its
 * incident connections re-routed to the moved anchors, drawn on the interaction layer
 * with the scene painters. The scene layer skips the node and those connections while
 * the preview is active. The entry comes from `GeometryScene.project`, so the painter
 * computes no geometry itself. Context starts in world space.
 */
import type { GeometryScene, NodeEntry } from "../../../../core/index.js";
import type { PaintFrame } from "../../primitives/frame.js";
import { paintEntries } from "../scene-layer.js";
import { ghostConnections } from "./ghost-entries.js";
import type { MovePreviewDeps } from "./move-preview-painter.js";
import type { ToolPreview } from "./preview-types.js";

type ResizePreview = Extract<ToolPreview, { kind: "resize" }>;

/** The node entry at the preview's size and position, or undefined when unbuildable. */
export function resizedEntry(
  deps: { readonly scene: Pick<GeometryScene, "project"> },
  preview: ResizePreview,
): NodeEntry | undefined {
  return deps.scene.project(preview.node, {
    size: preview.size,
    position: preview.position,
  });
}

export function paintResizePreview(
  ctx: CanvasRenderingContext2D,
  deps: MovePreviewDeps,
  frame: PaintFrame,
  preview: ResizePreview,
): void {
  const entry = resizedEntry(deps, preview);
  if (!entry) return;
  const changed = new Map<string, NodeEntry>([[entry.id, entry]]);
  paintEntries(ctx, deps, frame, [entry], ghostConnections(changed, deps));
}
