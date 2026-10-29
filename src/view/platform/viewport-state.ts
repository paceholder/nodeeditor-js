/**
 * Viewport state over the core viewport transform (GEO-01, GEO-03, GEO-06).
 *
 * Holds zoom/pan only; it never touches the model. Client-to-world conversion reads the
 * container rect at call time. While the container is not measurable it returns a
 * `not-measurable` rejection instead of NaN.
 */
import {
  clampZoom,
  createViewport,
  DEFAULT_VIEWPORT,
  err,
  ok,
  type Point,
  type Rejection,
  type Result,
  rejectionOf,
  type Viewport,
  viewportToWorld,
  zoomAt,
} from "../../core/index.js";
import type { ContainerMetrics } from "./dom/container-metrics.js";

export interface ViewportState {
  get(): Viewport;
  set(v: Viewport): Result<Viewport, Rejection>;
  zoomAt(
    anchor: Point<"viewport">,
    factor: number,
  ): Result<Viewport, Rejection>;
  panBy(dx: number, dy: number): Result<Viewport, Rejection>;
  clientToViewport(
    clientX: number,
    clientY: number,
  ): Result<Point<"viewport">, Rejection>;
  clientToWorld(
    clientX: number,
    clientY: number,
  ): Result<Point<"world">, Rejection>;
}

export function createViewportState(
  metrics: Pick<ContainerMetrics, "clientRect" | "isMeasurable">,
  onChange: () => void,
  initial: Viewport = DEFAULT_VIEWPORT,
): ViewportState {
  let current = initial;

  function commit(
    next: Result<Viewport, Rejection>,
  ): Result<Viewport, Rejection> {
    if (next.ok) {
      current = next.value;
      onChange();
    }
    return next;
  }

  const state: ViewportState = {
    get: () => current,
    set: (v) => commit(createViewport(v.zoom, v.panX, v.panY)),
    zoomAt(anchor, factor) {
      if (!Number.isFinite(factor) || factor <= 0) {
        return err(rejectionOf("non-finite", "Zoom factor must be positive"));
      }
      const target = clampZoom(current.zoom * factor);
      if (!target.ok) return target;
      return commit(zoomAt(current, target.value, anchor));
    },
    panBy: (dx, dy) =>
      commit(
        createViewport(current.zoom, current.panX + dx, current.panY + dy),
      ),
    clientToViewport(clientX, clientY) {
      if (!metrics.isMeasurable()) {
        return err(
          rejectionOf(
            "out-of-range",
            "Container is not measurable (zero size)",
          ),
        );
      }
      if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
        return err(rejectionOf("non-finite", "Client point must be finite"));
      }
      const r = metrics.clientRect();
      return ok({ x: clientX - r.left, y: clientY - r.top });
    },
    clientToWorld(clientX, clientY) {
      const p = state.clientToViewport(clientX, clientY);
      return p.ok ? ok(viewportToWorld(current, p.value)) : p;
    },
  };
  return state;
}
