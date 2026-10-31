/**
 * Resize handle painter (INT-10, D8): the grip on the screen bottom-right corner of the
 * single selected, resizable node, on the interaction layer above previews (order 20).
 * During a resize it follows the preview frame; during a move it is hidden, since the
 * node it belongs to is being drawn elsewhere. The geometry comes from
 * `resize-handle.ts`, the same function the resize tool picks with.
 */
import type {
  GeometryScene,
  NodeEntry,
  NodeId,
} from "../../../../core/index.js";
import type { InteractionPainter } from "../interaction-layer.js";
import type { ToolPreview } from "./preview-types.js";
import { RESIZE_HANDLE_PX, resizeHandleOf } from "./resize-handle.js";
import { resizedEntry } from "./resize-preview-painter.js";

export interface ResizeHandleSource {
  readonly scene: Pick<GeometryScene, "node" | "project">;
  /** The only selected entity when it is a node, else undefined. */
  readonly target: () => NodeId | undefined;
  /** Whether the resize capability allows resizing that node. */
  readonly resizable: (id: NodeId) => boolean;
  readonly preview: () => ToolPreview | null;
}

/** The node frame that carries the handle now, or undefined for no handle. */
export function resizeHandleEntry(
  source: ResizeHandleSource,
): NodeEntry | undefined {
  const preview = source.preview();
  if (preview?.kind === "resize") return resizedEntry(source, preview);
  if (preview?.kind === "move") return undefined;
  const id = source.target();
  if (!id || !source.resizable(id)) return undefined;
  return source.scene.node(id);
}

/** Interaction-layer order: above gesture previews (10), below presence (100). */
export const RESIZE_HANDLE_ORDER = 20;

export function createResizeHandlePainter(
  source: ResizeHandleSource,
): InteractionPainter {
  return {
    order: RESIZE_HANDLE_ORDER,
    paint(ctx, frame) {
      const entry = resizeHandleEntry(source);
      if (!entry) return;
      const { rect } = resizeHandleOf(entry, frame.viewport.zoom);
      const unit = 1 / frame.viewport.zoom;
      ctx.fillStyle = frame.theme.background;
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.lineWidth = unit;
      ctx.strokeStyle = frame.theme.selection;
      ctx.strokeRect(
        rect.x + unit / 2,
        rect.y + unit / 2,
        rect.w - unit,
        rect.h - unit,
      );
      // Grip: two diagonal strokes toward the outer corner.
      const right = rect.x + rect.w;
      const bottom = rect.y + rect.h;
      ctx.beginPath();
      for (const inset of [RESIZE_HANDLE_PX * 0.3, RESIZE_HANDLE_PX * 0.6]) {
        const d = inset * unit;
        ctx.moveTo(right - unit, bottom - d - unit);
        ctx.lineTo(right - d - unit, bottom - unit);
      }
      ctx.stroke();
    },
  };
}
