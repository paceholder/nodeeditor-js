/**
 * Viewport and device-pixel conversions.
 *
 *   viewport = world * zoom + pan        (CSS pixels)
 *   device   = viewport * dpr
 *
 * Zoom is always inside [MIN_ZOOM, MAX_ZOOM], so these maps are always invertible.
 * Page scroll and container offsets are handled by the view, which supplies
 * viewport-relative points.
 */
import { err, ok, type Rejection, type Result } from "../../base/result.js";
import { type Affine2, affine } from "./affine.js";
import { checkDpr, clampZoom } from "./limits.js";
import type { Point } from "./spaces.js";

export interface Viewport {
  readonly zoom: number;
  readonly panX: number;
  readonly panY: number;
}

export const DEFAULT_VIEWPORT: Viewport = { zoom: 1, panX: 0, panY: 0 };

/** Build a viewport; zoom is clamped (see `clampZoom`), non-finite input is rejected. */
export function createViewport(
  zoom: number,
  panX: number,
  panY: number,
): Result<Viewport, Rejection> {
  const z = clampZoom(zoom);
  if (!z.ok) return z;
  if (!Number.isFinite(panX) || !Number.isFinite(panY)) {
    return err({
      code: "non-finite",
      message: "Pan must be finite",
      entities: [],
    });
  }
  return ok({ zoom: z.value, panX, panY });
}

export function worldToViewport(
  v: Viewport,
  p: Point<"world">,
): Point<"viewport"> {
  return { x: p.x * v.zoom + v.panX, y: p.y * v.zoom + v.panY };
}

export function viewportToWorld(
  v: Viewport,
  p: Point<"viewport">,
): Point<"world"> {
  return { x: (p.x - v.panX) / v.zoom, y: (p.y - v.panY) / v.zoom };
}

export function viewportToDevice(
  dpr: number,
  p: Point<"viewport">,
): Point<"device"> {
  return { x: p.x * dpr, y: p.y * dpr };
}

export function deviceToViewport(
  dpr: number,
  p: Point<"device">,
): Point<"viewport"> {
  return { x: p.x / dpr, y: p.y / dpr };
}

/** World -> viewport matrix, ready to compose with a node matrix. */
export function viewportMatrix(v: Viewport): Affine2<"world", "viewport"> {
  return affine(v.zoom, 0, 0, v.zoom, v.panX, v.panY);
}

/** Viewport -> device matrix; rejects ratios outside the supported range. */
export function deviceMatrix(
  dpr: number,
): Result<Affine2<"viewport", "device">, Rejection> {
  const checked = checkDpr(dpr);
  if (!checked.ok) return checked;
  return ok(affine(dpr, 0, 0, dpr, 0, 0));
}

/**
 * Change zoom while keeping the world point under `anchor` (viewport CSS pixels) fixed.
 * The requested zoom is clamped.
 */
export function zoomAt(
  v: Viewport,
  requestedZoom: number,
  anchor: Point<"viewport">,
): Result<Viewport, Rejection> {
  const z = clampZoom(requestedZoom);
  if (!z.ok) return z;
  if (!Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) {
    return err({
      code: "non-finite",
      message: "Zoom anchor must be finite",
      entities: [],
    });
  }
  const world = viewportToWorld(v, anchor);
  return ok({
    zoom: z.value,
    panX: anchor.x - world.x * z.value,
    panY: anchor.y - world.y * z.value,
  });
}
