/**
 * Zoom commands: zoom in or out by a factor about the view's centre,
 * inside the view's zoom limits. View-local, like fit: they move the viewport only and
 * never touch the model. A step that would not change the zoom (already at the limit) is
 * unavailable, so a toolbar can disable the button.
 */

import {
  err,
  ok,
  type Rejection,
  type Result,
  rejectionOf,
  type Viewport,
  zoomAt,
} from "../../../core/index.js";
import {
  clampToLimits,
  type ResolvedZoomLimits,
} from "../../platform/zoom-limits.js";

/** A zoom step; one press of a "+" or "-" button. */
export const DEFAULT_ZOOM_STEP = 1.25;

export type ZoomOutcome = Result<{ readonly changed: boolean }, Rejection>;

export interface ZoomCommands {
  /** Zoom by `factor` about the centre of the view; `factor` > 1 zooms in. */
  zoomBy(factor: number): ZoomOutcome;
  /** Whether zooming by `factor` would change the zoom: false at the matching limit. */
  canZoomBy(factor: number): boolean;
}

export interface ZoomCommandDeps {
  readonly viewport: {
    get(): Viewport;
    set(v: Viewport): Result<Viewport, Rejection>;
  };
  readonly size: () => { readonly width: number; readonly height: number };
  /** Read on every call, because the limits can change while the view is mounted. */
  readonly limits: () => ResolvedZoomLimits;
}

const EPSILON = 1e-9;

export function createZoomCommands(deps: ZoomCommandDeps): ZoomCommands {
  const target = (factor: number): number =>
    clampToLimits(deps.viewport.get().zoom * factor, deps.limits());
  const valid = (factor: number): boolean =>
    Number.isFinite(factor) && factor > 0;
  return {
    canZoomBy: (factor) =>
      valid(factor) &&
      Math.abs(target(factor) - deps.viewport.get().zoom) > EPSILON,
    zoomBy(factor) {
      if (!valid(factor)) {
        return err(rejectionOf("non-finite", "Zoom factor must be positive"));
      }
      const { width, height } = deps.size();
      if (width <= 0 || height <= 0) {
        return err(
          rejectionOf("out-of-range", "View is not measurable (zero size)"),
        );
      }
      const current = deps.viewport.get();
      const zoom = target(factor);
      if (Math.abs(zoom - current.zoom) <= EPSILON)
        return ok({ changed: false });
      const next = zoomAt(current, zoom, { x: width / 2, y: height / 2 });
      if (!next.ok) return next;
      const set = deps.viewport.set(next.value);
      return set.ok ? ok({ changed: true }) : set;
    },
  };
}
