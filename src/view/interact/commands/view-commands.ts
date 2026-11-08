/**
 * View commands (D8): fit all, fit selection, reset, reveal. They change the
 * view-local viewport only and never touch the model. The command registry wraps these
 * under the stable IDs below, so shortcuts, menus and the API share one implementation.
 */
import {
  type ConnectionId,
  connectionId,
  err,
  type GeometryScene,
  type GraphReader,
  type NodeId,
  nodeId,
  ok,
  type Rect,
  type Rejection,
  type Result,
  rejectionOf,
  unionRects,
  type Viewport,
} from "../../../core/index.js";
import {
  ABSOLUTE_ZOOM_LIMITS,
  type ResolvedZoomLimits,
} from "../../platform/zoom-limits.js";
import type { ReadonlySelection } from "../selection/selection-model.js";
import { type FitOptions, fitViewport, revealViewport } from "./view-fit.js";
import { createZoomCommands, type ZoomCommands } from "./zoom-commands.js";

/** `changed: false` is the successful no-op (empty graph, nothing selected, already visible). */
export type ViewCommandOutcome = Result<
  { readonly changed: boolean },
  Rejection
>;

export interface ViewCommandDeps {
  readonly reader: GraphReader;
  readonly scene: Pick<GeometryScene, "node" | "connection">;
  readonly selection: ReadonlySelection;
  readonly viewport: {
    get(): Viewport;
    set(v: Viewport): Result<Viewport, Rejection>;
  };
  /** CSS size of the view. */
  readonly size: () => { readonly width: number; readonly height: number };
  readonly options?: FitOptions;
  /** The view's zoom range for the zoom commands, read on each call. Default: absolute. */
  readonly zoomLimits?: () => ResolvedZoomLimits;
}

export interface ViewCommands extends ZoomCommands {
  fitAll(): ViewCommandOutcome;
  fitSelection(): ViewCommandOutcome;
  resetView(): ViewCommandOutcome;
  /** Pan, and zoom out if needed, so the node or connection is fully visible. */
  reveal(id: NodeId | ConnectionId): ViewCommandOutcome;
}

const NOOP: ViewCommandOutcome = ok({ changed: false });

export function createViewCommands(deps: ViewCommandDeps): ViewCommands {
  const boundsOf = (id: string): Rect<"world"> | undefined =>
    deps.scene.node(nodeId(id))?.paintedBounds ??
    deps.scene.connection(connectionId(id))?.paintedBounds;

  function union(ids: Iterable<string>): Rect<"world"> | undefined {
    let acc: Rect<"world"> | undefined;
    for (const id of ids) {
      const b = boundsOf(id);
      if (b) acc = acc ? unionRects(acc, b) : b;
    }
    return acc;
  }

  function apply(next: Viewport): ViewCommandOutcome {
    const cur = deps.viewport.get();
    if (
      Math.abs(next.zoom - cur.zoom) < 1e-12 &&
      Math.abs(next.panX - cur.panX) < 1e-9 &&
      Math.abs(next.panY - cur.panY) < 1e-9
    ) {
      return NOOP;
    }
    const set = deps.viewport.set(next);
    return set.ok ? ok({ changed: true }) : set;
  }

  function fitTo(bounds: Rect<"world"> | undefined): ViewCommandOutcome {
    if (!bounds) return NOOP;
    const size = deps.size();
    if (size.width <= 0 || size.height <= 0) {
      return err(
        rejectionOf("out-of-range", "View is not measurable (zero size)"),
      );
    }
    return apply(fitViewport(bounds, size, deps.options));
  }

  return {
    ...createZoomCommands({
      viewport: deps.viewport,
      size: deps.size,
      limits: deps.zoomLimits ?? (() => ABSOLUTE_ZOOM_LIMITS),
    }),
    fitAll: () =>
      fitTo(
        union([
          ...deps.reader.nodes().map((n) => n.id),
          ...deps.reader.connections().map((c) => c.id),
        ]),
      ),
    fitSelection: () =>
      fitTo(union(deps.selection.keys().map((k) => k.slice(2)))),
    resetView: () => apply({ zoom: 1, panX: 0, panY: 0 }),
    reveal(id) {
      const bounds = boundsOf(id);
      if (!bounds) {
        return err(rejectionOf("unknown-entity", `Cannot reveal ${id}`, [id]));
      }
      const size = deps.size();
      if (size.width <= 0 || size.height <= 0) {
        return err(
          rejectionOf("out-of-range", "View is not measurable (zero size)"),
        );
      }
      return apply(
        revealViewport(deps.viewport.get(), bounds, size, deps.options),
      );
    },
  };
}
