/**
 * Auto-pan velocity and arming (D10). Pure: viewport points and sizes in CSS
 * pixels in, a velocity in CSS pixels per second out. Positive x means "show more of
 * what lies right of the view", so the driver pans the content by `-v · dt`.
 *
 * Per axis the speed is zero outside the edge band, rises linearly from 0 at the band's
 * inner boundary to `maxSpeedPxPerSecond` at the view edge, and stays there when the
 * pointer is outside the view (pointer capture keeps the gesture alive). In a corner
 * both axes pan. A gesture that starts inside a band is not armed until the pointer has
 * left every band once or moved closer to an edge than where it started, so grabbing a
 * node near the edge does not scroll the view.
 */
import type { Point, Vec2 } from "../../../core/index.js";

export interface AutoPanOptions {
  /** Width of the band along each view edge, CSS pixels. */
  readonly edgePx: number;
  /** Speed at the view edge and beyond, CSS pixels per second. */
  readonly maxSpeedPxPerSecond: number;
}

export const DEFAULT_AUTO_PAN: AutoPanOptions = {
  edgePx: 32,
  maxSpeedPxPerSecond: 600,
};

export interface ViewSize {
  readonly width: number;
  readonly height: number;
}

const ZERO: Vec2 = { x: 0, y: 0 };

/** Speed along one axis: negative toward the low edge, positive toward the high edge. */
function axisSpeed(
  at: number,
  extent: number,
  options: AutoPanOptions,
): number {
  const { edgePx, maxSpeedPxPerSecond: max } = options;
  if (edgePx <= 0 || extent <= 0) return 0;
  const band = Math.min(edgePx, extent / 2);
  const low = band - at;
  const high = at - (extent - band);
  const depth = Math.max(low, high);
  if (depth <= 0) return 0;
  const speed = max * Math.min(depth / band, 1);
  return low > high ? -speed : speed;
}

export function autoPanVelocity(
  pointer: Point<"viewport">,
  size: ViewSize,
  options: AutoPanOptions | false,
): Vec2 {
  if (options === false) return ZERO;
  return {
    x: axisSpeed(pointer.x, size.width, options) + 0,
    y: axisSpeed(pointer.y, size.height, options) + 0,
  };
}

/** Arming of one gesture: where it started, and whether auto-pan may act yet. */
export interface AutoPanArm {
  readonly start: Point<"viewport">;
  readonly armed: boolean;
}

export function startArm(
  pointer: Point<"viewport">,
  size: ViewSize,
  options: AutoPanOptions | false,
): AutoPanArm {
  const v = autoPanVelocity(pointer, size, options);
  return { start: pointer, armed: v.x === 0 && v.y === 0 };
}

/** Arm once the pointer leaves the bands or goes deeper toward an edge than at start. */
export function updateArm(
  arm: AutoPanArm,
  pointer: Point<"viewport">,
  size: ViewSize,
  options: AutoPanOptions | false,
): AutoPanArm {
  if (arm.armed) return arm;
  const now = autoPanVelocity(pointer, size, options);
  const then = autoPanVelocity(arm.start, size, options);
  const deeper = (a: number, b: number) =>
    Math.abs(a) > Math.abs(b) && (b === 0 || Math.sign(a) === Math.sign(b));
  const left = now.x === 0 && now.y === 0;
  return left || deeper(now.x, then.x) || deeper(now.y, then.y)
    ? { ...arm, armed: true }
    : arm;
}

/** The velocity a gesture may use now: zero until armed. */
export function armedVelocity(
  arm: AutoPanArm,
  pointer: Point<"viewport">,
  size: ViewSize,
  options: AutoPanOptions | false,
): Vec2 {
  return arm.armed ? autoPanVelocity(pointer, size, options) : ZERO;
}
