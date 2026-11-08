/**
 * Per-view zoom limits. They narrow the absolute bounds of the core viewport:
 * wheel, pinch, programmatic zoom, `set` and fit all stay inside them.
 */
import { MAX_ZOOM, MIN_ZOOM } from "../../core/index.js";

export interface ZoomLimits {
  readonly min?: number;
  readonly max?: number;
}

export interface ResolvedZoomLimits {
  readonly min: number;
  readonly max: number;
}

export const ABSOLUTE_ZOOM_LIMITS: ResolvedZoomLimits = {
  min: MIN_ZOOM,
  max: MAX_ZOOM,
};

/** Fill in the absolute bounds. Throws for unusable limits (programmer misuse). */
export function resolveZoomLimits(limits?: ZoomLimits): ResolvedZoomLimits {
  const min = limits?.min ?? MIN_ZOOM;
  const max = limits?.max ?? MAX_ZOOM;
  if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || min > max) {
    throw new RangeError(`Invalid zoom limits: min ${min}, max ${max}`);
  }
  return { min: Math.max(min, MIN_ZOOM), max: Math.min(max, MAX_ZOOM) };
}

/** Zoom limits that can change while the view is mounted; readers see the current pair. */
export interface ZoomLimitsHolder extends ResolvedZoomLimits {
  /** Replace the limits; no argument restores the absolute bounds. Throws for unusable limits. */
  set(limits?: ZoomLimits): void;
}

export function createZoomLimits(initial?: ZoomLimits): ZoomLimitsHolder {
  let current = resolveZoomLimits(initial);
  return {
    get min() {
      return current.min;
    },
    get max() {
      return current.max;
    },
    set(limits) {
      current = resolveZoomLimits(limits);
    },
  };
}

export const clampToLimits = (
  zoom: number,
  limits: ResolvedZoomLimits,
): number => Math.min(limits.max, Math.max(limits.min, zoom));
