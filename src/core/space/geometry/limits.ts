/**
 * Supported ranges and validators.
 *
 * - World coordinates: |x|, |y| <= `MAX_WORLD_COORD` (1e7). Beyond that, double precision
 *   leaves less than a millionth of a world unit, and picking tolerances degrade.
 * - Zoom: `MIN_ZOOM` (1e-3) to `MAX_ZOOM` (1e3). Requests outside are CLAMPED by
 *   `clampZoom`; non-finite requests are rejected.
 * - Device pixel ratio: finite, in `[MIN_DPR, MAX_DPR]`; outside is rejected.
 * - Matrices: non-finite or |determinant| < `MIN_DETERMINANT` cannot be inverted.
 */
import {
  err,
  ok,
  type Rejection,
  type Result,
  rejectionOf,
} from "../../base/result.js";
import { isFinitePoint, type Point, type Space } from "./spaces.js";

export const MAX_WORLD_COORD = 1e7;
export const MIN_ZOOM = 1e-3;
export const MAX_ZOOM = 1e3;
export const MIN_DPR = 0.1;
export const MAX_DPR = 16;
export const MIN_DETERMINANT = 1e-12;

export function isInWorldRange(p: { x: number; y: number }): boolean {
  return (
    isFinitePoint(p) &&
    Math.abs(p.x) <= MAX_WORLD_COORD &&
    Math.abs(p.y) <= MAX_WORLD_COORD
  );
}

/** Reject non-finite or out-of-range world points. */
export function checkWorldPoint(
  p: Point<"world">,
): Result<Point<"world">, Rejection> {
  if (!isFinitePoint(p)) {
    return err(rejectionOf("non-finite", "World point must be finite"));
  }
  if (!isInWorldRange(p)) {
    return err(
      rejectionOf(
        "out-of-range",
        `World coordinates must stay within +-${MAX_WORLD_COORD}`,
      ),
    );
  }
  return ok(p);
}

/** Clamp a zoom request into the supported range; non-finite requests are rejected. */
export function clampZoom(zoom: number): Result<number, Rejection> {
  if (!Number.isFinite(zoom)) {
    return err(rejectionOf("non-finite", "Zoom must be finite"));
  }
  return ok(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)));
}

export function checkDpr(dpr: number): Result<number, Rejection> {
  if (!Number.isFinite(dpr)) {
    return err(rejectionOf("non-finite", "Device pixel ratio must be finite"));
  }
  if (dpr < MIN_DPR || dpr > MAX_DPR) {
    return err(
      rejectionOf(
        "out-of-range",
        `Device pixel ratio must be within [${MIN_DPR}, ${MAX_DPR}]`,
      ),
    );
  }
  return ok(dpr);
}

export type { Space };
