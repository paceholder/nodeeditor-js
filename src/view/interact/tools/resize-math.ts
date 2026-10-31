/**
 * Resize math for the resize tool (INT-10, NOD-04a, D7). Pure: a start frame, the press
 * and current pointer, and the options in; the preview size and anchored centre out.
 *
 * The pointer delta is mapped into the node's local frame with the start entry's
 * `toLocal`, so rotation and mirroring need no special cases: with the handle on local
 * corner `c`, `w' = w + c.x · d.x` and `h' = h + c.y · d.y`. Then, in order: grid
 * snapping of the moving corner (only with a grid step, Alt suppresses it), the aspect
 * ratio (Shift), and clamping to the limits, so the committed size is always inside
 * them. The centre comes from core's `anchoredPosition` with the opposite corner fixed,
 * the same arithmetic the `resizeNode` planner uses.
 */
import {
  anchoredPosition,
  applyPoint,
  applyVector,
  type NodeEntry,
  type Point,
  type ResizeFixed,
  type ResolvedSizeLimits,
  type Size,
  type Vec2,
} from "../../../core/index.js";
import type { LocalCorner } from "../../render/paint/previews/resize-handle.js";

export type ResizeStart = Pick<NodeEntry, "record" | "toWorld" | "toLocal">;

export interface ResizeStep {
  readonly press: Point<"world">;
  readonly pointer: Point<"world">;
  /** Keep the start width-to-height ratio (Shift). */
  readonly keepAspect: boolean;
  readonly gridStep: number | undefined;
  /** Alt held: no snapping, as for moves (INT-03). */
  readonly suppressSnap: boolean;
  readonly limits: ResolvedSizeLimits;
}

export interface ResizeResult {
  readonly size: Size;
  readonly position: Vec2;
}

/** The local point a resize from `corner` keeps in place: the opposite corner. */
export function fixedFor(corner: LocalCorner): ResizeFixed {
  return { x: corner.x === 1 ? -1 : 1, y: corner.y === 1 ? -1 : 1 };
}

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(Math.max(v, lo), hi);

/** Snap the moving corner's world position to the grid; returns the implied size. */
function snapToGrid(
  start: ResizeStart,
  corner: LocalCorner,
  size: Size,
  step: number,
): Size {
  const { width: w, height: h } = start.record.size;
  const fixed = applyPoint(start.toWorld, {
    x: (-corner.x * w) / 2,
    y: (-corner.y * h) / 2,
  });
  const span = applyVector(start.toWorld, {
    x: corner.x * size.width,
    y: corner.y * size.height,
  });
  const snap = (v: number): number => Math.round(v / step) * step;
  const moving = { x: snap(fixed.x + span.x), y: snap(fixed.y + span.y) };
  const local = applyVector(start.toLocal, {
    x: moving.x - fixed.x,
    y: moving.y - fixed.y,
  });
  return { width: corner.x * local.x, height: corner.y * local.y };
}

/** Scale both axes by the factor of the axis that changed more (relative to start). */
function keepRatio(start: Size, size: Size): Size {
  if (start.width <= 0 || start.height <= 0) return size;
  const sx = size.width / start.width;
  const sy = size.height / start.height;
  const s = Math.abs(sx - 1) >= Math.abs(sy - 1) ? sx : sy;
  return { width: start.width * s, height: start.height * s };
}

/**
 * Clamp to the limits. With the ratio kept, the common factor is clamped so both axes
 * stay inside; when the limits cannot hold the ratio, the limits win per axis.
 */
function clampToLimits(
  start: Size,
  size: Size,
  limits: ResolvedSizeLimits,
  keepAspect: boolean,
): Size {
  const { min, max } = limits;
  if (keepAspect && start.width > 0 && start.height > 0) {
    const lo = Math.max(min.width / start.width, min.height / start.height);
    const hi = Math.min(max.width / start.width, max.height / start.height);
    if (lo <= hi) {
      const s = clamp(size.width / start.width, lo, hi);
      return { width: start.width * s, height: start.height * s };
    }
  }
  return {
    width: clamp(size.width, min.width, max.width),
    height: clamp(size.height, min.height, max.height),
  };
}

export function resizeStep(
  start: ResizeStart,
  corner: LocalCorner,
  step: ResizeStep,
): ResizeResult {
  const startSize = start.record.size;
  const d = applyVector(start.toLocal, {
    x: step.pointer.x - step.press.x,
    y: step.pointer.y - step.press.y,
  });
  let size: Size = {
    width: startSize.width + corner.x * d.x,
    height: startSize.height + corner.y * d.y,
  };
  if (step.gridStep !== undefined && step.gridStep > 0 && !step.suppressSnap) {
    size = snapToGrid(start, corner, size, step.gridStep);
  }
  if (step.keepAspect) size = keepRatio(startSize, size);
  size = clampToLimits(startSize, size, step.limits, step.keepAspect);
  return {
    size,
    position: anchoredPosition(start.record, size, fixedFor(corner)),
  };
}
