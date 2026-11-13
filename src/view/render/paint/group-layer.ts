/**
 * Group frame painting, shared by the scene layer and the move preview.
 *
 * Frames are painted in document order, beneath connections and nodes, in world space.
 * The painter is host code: every call is isolated, its saved state is always restored
 * and an error goes to `fault` while the other frames still paint.
 */
import {
  type GroupFrameMetrics,
  type GroupRecord,
  groupLockBox,
  groupTitleStrip,
  type Rect,
} from "../../../core/index.js";
import { rethrowLater } from "../../platform/rethrow-later.js";
import { type PaintFrame, setMatrix } from "../primitives/frame.js";
import type { GroupFramePainter } from "../registries/painter-types.js";
import { resolveGroupStyle } from "../theme/resolve-style.js";
import { detailPolicy } from "./level-of-detail.js";

export interface GroupFrameItem {
  readonly record: GroupRecord;
  readonly frame: Rect<"world">;
  /** A dragged node will join this group on drop. */
  readonly joinTarget?: boolean;
}

export interface GroupLayerDeps {
  readonly painter: GroupFramePainter;
  readonly metrics: GroupFrameMetrics;
  readonly state: {
    isSelected(id: string): boolean;
    isHovered(id: string): boolean;
    isUnconfirmed?(id: string): boolean;
  };
  readonly fault?: (error: unknown) => void;
}

export function paintGroupFrames(
  ctx: CanvasRenderingContext2D,
  deps: GroupLayerDeps,
  frame: PaintFrame,
  items: readonly GroupFrameItem[],
): void {
  if (items.length === 0) return;
  const zoom = frame.viewport.zoom;
  const detail = detailPolicy(zoom, frame.theme);
  const unit = frame.theme.screenSpaceLines ? 1 / zoom : 1;
  const fault = deps.fault ?? rethrowLater;
  setMatrix(ctx, frame.worldToDevice);
  for (const item of items) {
    const { record } = item;
    ctx.save();
    try {
      deps.painter.paint(ctx, {
        group: record,
        frame: item.frame,
        titleStrip: groupTitleStrip(item.frame, deps.metrics),
        lockBox: groupLockBox(item.frame, deps.metrics, zoom),
        style: resolveGroupStyle(frame.theme, record.style),
        theme: frame.theme,
        detail,
        unit,
        state: {
          selected: deps.state.isSelected(record.id),
          hovered: deps.state.isHovered(record.id),
          joinTarget: item.joinTarget === true,
          unconfirmed: deps.state.isUnconfirmed?.(record.id) === true,
        },
      });
    } catch (error) {
      fault(error);
    } finally {
      ctx.restore();
    }
  }
}
