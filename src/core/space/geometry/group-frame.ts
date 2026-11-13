/**
 * Frame of a group, derived from its members.
 *
 * A group stores no rectangle: the frame is the union of the members' body bounds, grown
 * by a padding and by a title strip along the top. The lock icon's box sits in the
 * strip's right corner and keeps a constant size on screen, so it takes the zoom.
 */
import {
  rectBottom,
  rectContainsPoint,
  rectRight,
  unionRects,
} from "./rect.js";
import { isFiniteRect, type Point, type Rect, rect } from "./spaces.js";

type W = "world";

export interface GroupFrameMetrics {
  /** Space between the members and the frame's edge, world units. */
  readonly padding: number;
  /** Height of the title strip above the members, world units. */
  readonly titleHeight: number;
  /** Side of the lock icon's pointer target, CSS pixels. */
  readonly lockSizePx: number;
  /** Gap between the lock target and the frame's corner, CSS pixels. */
  readonly lockInsetPx: number;
}

export const DEFAULT_GROUP_FRAME_METRICS: GroupFrameMetrics = {
  padding: 16,
  titleHeight: 24,
  lockSizePx: 16,
  lockInsetPx: 4,
};

/** Which part of a frame a point is on. The interior is not a part. */
export type GroupFramePart = "lock" | "title" | "border";

/** The frame around `members`, or undefined for no members or non-finite bounds. */
export function groupFrame(
  members: readonly Rect<W>[],
  metrics: GroupFrameMetrics,
): Rect<W> | undefined {
  const first = members[0];
  if (!first) return undefined;
  const content = members.slice(1).reduce(unionRects, first);
  const frame = rect<W>(
    content.x - metrics.padding,
    content.y - metrics.padding - metrics.titleHeight,
    content.w + 2 * metrics.padding,
    content.h + 2 * metrics.padding + metrics.titleHeight,
  );
  return isFiniteRect(frame) ? frame : undefined;
}

export function groupTitleStrip(
  frame: Rect<W>,
  metrics: GroupFrameMetrics,
): Rect<W> {
  return rect<W>(
    frame.x,
    frame.y,
    frame.w,
    Math.min(metrics.titleHeight, frame.h),
  );
}

/** The lock icon's box at `zoom`: a square of constant screen size in the top-right corner. */
export function groupLockBox(
  frame: Rect<W>,
  metrics: GroupFrameMetrics,
  zoom: number,
): Rect<W> {
  const side = metrics.lockSizePx / zoom;
  const inset = metrics.lockInsetPx / zoom;
  return rect<W>(rectRight(frame) - inset - side, frame.y + inset, side, side);
}

/**
 * The part of `frame` under `point`: the lock box, else the title strip, else the border
 * (a band of `tolerance` world units on both sides of the outline). A point in the
 * interior hits nothing, so a press there behaves as on empty canvas.
 */
export function groupFramePartAt(
  frame: Rect<W>,
  metrics: GroupFrameMetrics,
  point: Point<W>,
  zoom: number,
  tolerance: number,
): GroupFramePart | undefined {
  if (rectContainsPoint(groupLockBox(frame, metrics, zoom), point))
    return "lock";
  if (rectContainsPoint(groupTitleStrip(frame, metrics), point)) return "title";
  const outer = rect<W>(
    frame.x - tolerance,
    frame.y - tolerance,
    frame.w + 2 * tolerance,
    frame.h + 2 * tolerance,
  );
  if (!rectContainsPoint(outer, point)) return undefined;
  const nearEdge =
    point.x - frame.x <= tolerance ||
    rectRight(frame) - point.x <= tolerance ||
    point.y - frame.y <= tolerance ||
    rectBottom(frame) - point.y <= tolerance;
  return nearEdge ? "border" : undefined;
}
