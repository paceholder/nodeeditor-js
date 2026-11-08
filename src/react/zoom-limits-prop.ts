/**
 * Checks the `zoomLimits` prop before it reaches the view. The view throws for
 * unusable limits because that is programmer misuse; a prop is often built from state, and
 * a transient bad value (a min typed above the max) must not unmount the tree from an effect.
 */
import { MAX_ZOOM, MIN_ZOOM } from "../core/index.js";
import type { ZoomLimits } from "../view/index.js";
import { devWarn } from "./dev-warning.js";

/** True when the view would accept the limits: finite, min above 0 and not above max. */
export function zoomLimitsUsable(limits: ZoomLimits): boolean {
  const min = limits.min ?? MIN_ZOOM;
  const max = limits.max ?? MAX_ZOOM;
  return Number.isFinite(min) && Number.isFinite(max) && min > 0 && min <= max;
}

/** Warns (in development) that an unusable `zoomLimits` prop is being ignored. */
export function warnZoomLimitsIgnored(limits: ZoomLimits): void {
  devWarn(
    `Ignoring the zoomLimits prop: min ${limits.min ?? "(default)"} and max ` +
      `${limits.max ?? "(default)"} are not a usable range (finite, min above 0 and ` +
      "not above max).",
  );
}
