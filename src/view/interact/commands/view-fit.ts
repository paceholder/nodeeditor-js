/** Pure viewport math for fit and reveal (INT-01, D8). CSS pixels; no model access. */
import { clampZoom, type Rect, type Viewport } from "../../../core/index.js";

export interface FitOptions {
  /** Margin kept free on every side, CSS pixels. Default 40. */
  readonly paddingPx?: number;
  /** Fit never zooms in past this. Default 2. */
  readonly maxZoom?: number;
}

export const DEFAULT_PADDING_PX = 40;
export const DEFAULT_FIT_MAX_ZOOM = 2;

interface Size {
  readonly width: number;
  readonly height: number;
}

function zoomFor(bounds: Rect<"world">, size: Size, opts: FitOptions): number {
  const pad = opts.paddingPx ?? DEFAULT_PADDING_PX;
  const availW = Math.max(1, size.width - 2 * pad);
  const availH = Math.max(1, size.height - 2 * pad);
  const fit = Math.min(
    bounds.w > 0 ? availW / bounds.w : Number.POSITIVE_INFINITY,
    bounds.h > 0 ? availH / bounds.h : Number.POSITIVE_INFINITY,
  );
  const capped = Math.min(fit, opts.maxZoom ?? DEFAULT_FIT_MAX_ZOOM);
  const clamped = clampZoom(capped);
  return clamped.ok ? clamped.value : 1;
}

/** Viewport that shows `bounds` centered with padding. */
export function fitViewport(
  bounds: Rect<"world">,
  size: Size,
  opts: FitOptions = {},
): Viewport {
  const zoom = zoomFor(bounds, size, opts);
  return {
    zoom,
    panX: size.width / 2 - (bounds.x + bounds.w / 2) * zoom,
    panY: size.height / 2 - (bounds.y + bounds.h / 2) * zoom,
  };
}

function panAxis(
  min: number,
  max: number,
  pan: number,
  zoom: number,
  length: number,
  pad: number,
): number {
  const lo = min * zoom + pan;
  const hi = max * zoom + pan;
  if (hi - lo >= length - 2 * pad - 1e-9)
    return length / 2 - ((min + max) / 2) * zoom;
  if (lo < pad) return pan + (pad - lo);
  if (hi > length - pad) return pan - (hi - (length - pad));
  return pan;
}

/**
 * Minimal change that makes `bounds` fully visible with padding: pan if it fits at the
 * current zoom, otherwise zoom out just enough and center. Unchanged when already visible.
 */
export function revealViewport(
  current: Viewport,
  bounds: Rect<"world">,
  size: Size,
  opts: FitOptions = {},
): Viewport {
  const pad = opts.paddingPx ?? DEFAULT_PADDING_PX;
  const zoom = Math.min(
    current.zoom,
    zoomFor(bounds, size, { ...opts, maxZoom: current.zoom }),
  );
  return {
    zoom,
    panX: panAxis(
      bounds.x,
      bounds.x + bounds.w,
      current.panX,
      zoom,
      size.width,
      pad,
    ),
    panY: panAxis(
      bounds.y,
      bounds.y + bounds.h,
      current.panY,
      zoom,
      size.height,
      pad,
    ),
  };
}
