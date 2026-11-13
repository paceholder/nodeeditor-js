/**
 * Builds the read-only `ToolContext` (D2) over a model reader, a geometry scene and the
 * view-local selection. Capability checks go through the model's own dry-run planner
 * (`can`), so previews and commits agree.
 */
import type {
  Availability,
  CapabilityAction,
  Command,
  Endpoint,
  GeometryScene,
  GraphReader,
  NodeId,
  PlanResult,
  ResolvedSizeLimits,
  Size,
  Viewport,
} from "../../../core/index.js";
import {
  DEFAULT_SIZE_LIMITS,
  MAX_ZOOM,
  MIN_ZOOM,
  rejectionOf,
} from "../../../core/index.js";
import type {
  RouteEditContext,
  RouteEditorRegistry,
} from "../../render/registries/route-editor-registry.js";
import type { ReadonlySelection } from "../selection/selection-model.js";
import { evaluationOf, NO_MODEL_EVALUATION } from "./connect-evaluation.js";
import {
  resolveToolOptions,
  type ToolOptions,
  type ToolOptionsInput,
} from "./thresholds.js";
import type { ConnectionEvaluation, ToolContext } from "./tool-types.js";

export interface ToolContextDeps {
  readonly reader: GraphReader;
  readonly scene: Pick<
    GeometryScene,
    | "queryRect"
    | "node"
    | "connection"
    | "pick"
    | "group"
    | "groups"
    | "groupMetrics"
  >;
  readonly selection: ReadonlySelection;
  readonly viewport: () => Viewport;
  readonly can: (action: CapabilityAction, id: NodeId) => Availability;
  /** Read on every gesture step, so a getter lets options change at runtime. */
  readonly options?: ToolOptionsInput | (() => ToolOptionsInput);
  /** Resolved size limits (`GraphModel.sizeLimits`); omitted: the library default. */
  readonly sizeLimits?: SizeLimitsLookup;
  /** Dry-run planner of the model (`GraphModel.plan`); without it nothing can connect. */
  readonly plan?: (command: Command) => PlanResult;
  /**
   * Zoom below which ports are hidden (the theme's `lodHidePortsBelow`). Picks
   * then skip ports, so a press there selects, moves or pans. Omitted: ports always count.
   */
  readonly hidePortsBelow?: () => number;
  /** The view's zoom range; omitted: the absolute bounds. */
  readonly zoomRange?: { readonly min: number; readonly max: number };
  /** Whether a host connection chooser is installed; omitted: none. */
  readonly chooserInstalled?: () => boolean;
  /** Whether a host validator answers pending connections; omitted: none. */
  readonly verdictsInstalled?: () => boolean;
  /** Route editors per connection kind; omitted: none. */
  readonly routeEditors?: Pick<RouteEditorRegistry, "get">;
  /** Re-routes an entry through other constraints; omitted: never. */
  readonly reroute?: RouteEditContext["reroute"];
}

const NO_ROUTE_EDITORS: Pick<RouteEditorRegistry, "get"> = {
  get: () => undefined,
};

export type SizeLimitsLookup = (id: NodeId) => ResolvedSizeLimits | undefined;

/** A model's `sizeLimits` method when it has one (a `GraphModel` does). */
export function sizeLimitsOf(model: object): SizeLimitsLookup | undefined {
  const m = model as { sizeLimits?: unknown };
  return typeof m.sizeLimits === "function"
    ? (m.sizeLimits as SizeLimitsLookup)
    : undefined;
}

/** The context factory; `invalidate` drops cached evaluations that depend on host verdicts. */
export type ToolContextProvider = (() => ToolContext) & {
  invalidate(): void;
};

export function createToolContext(deps: ToolContextDeps): ToolContextProvider {
  const source = deps.options;
  let resolvedFrom: ToolOptionsInput | undefined;
  let options = resolveToolOptions();
  // Re-resolve only when the getter hands back a different object.
  const currentOptions = (): ToolOptions => {
    const over = typeof source === "function" ? source() : source;
    if (over !== resolvedFrom) {
      resolvedFrom = over;
      options = resolveToolOptions(over);
    }
    return options;
  };
  // Evaluations are valid for one revision; any committed change drops them.
  let cache = new Map<string, ConnectionEvaluation>();
  let cacheRevision = deps.reader.revision();
  const evaluateConnection = (
    from: Endpoint,
    to: Endpoint,
  ): ConnectionEvaluation => {
    const plan = deps.plan;
    if (!plan) return NO_MODEL_EVALUATION;
    const revision = deps.reader.revision();
    if (revision !== cacheRevision) {
      cache = new Map();
      cacheRevision = revision;
    }
    const key = `${from.port}>${to.port}`;
    let hit = cache.get(key);
    if (!hit) {
      hit = evaluationOf(plan({ kind: "connect", from, to }), to, deps.reader);
      cache.set(key, hit);
    }
    return hit;
  };
  const sizeLimits = (id: NodeId): ResolvedSizeLimits =>
    deps.sizeLimits?.(id) ?? DEFAULT_SIZE_LIMITS;
  const provide = (): ToolContext => {
    const viewport = deps.viewport();
    const options = currentOptions();
    const ports = viewport.zoom >= (deps.hidePortsBelow?.() ?? 0);
    return {
      pick: (world) =>
        deps.scene.pick(world, {
          zoom: viewport.zoom,
          tolerancePx: options.pickTolerancePx,
          ports,
        }),
      reader: deps.reader,
      scene: deps.scene,
      selection: deps.selection,
      viewport,
      zoom: viewport.zoom,
      zoomRange: deps.zoomRange ?? { min: MIN_ZOOM, max: MAX_ZOOM },
      can: deps.can,
      sizeLimits,
      evaluateConnection,
      options,
      chooserInstalled: deps.chooserInstalled?.() === true,
      verdictsInstalled: deps.verdictsInstalled?.() === true,
      routeEditors: deps.routeEditors ?? NO_ROUTE_EDITORS,
      reroute: deps.reroute ?? (() => undefined),
    };
  };
  // A verdict settles without changing the model revision, so the cache is dropped by hand.
  return Object.assign(provide, {
    invalidate() {
      cache = new Map();
    },
  });
}

/**
 * Capability probe through a model's `can`: each action is answered by a
 * one-step trial command, so it exercises exactly the capability gate a real edit would
 * hit. `move` of a member of a locked group tries the whole group, which is the only
 * move such a node can make, so one member that may not move holds all of them. `resize` tries one unit wider (or narrower, or taller or shorter where the limits
 * require); a node whose limits leave no other size is unavailable with `out-of-range`.
 */
export function capabilityProbe(model: {
  readonly reader: GraphReader;
  can(command: Command): Availability;
  sizeLimits?: SizeLimitsLookup;
}): (action: CapabilityAction, id: NodeId) => Availability {
  return (action, id) => {
    const node = model.reader.getNode(id);
    if (!node) {
      return {
        available: false,
        rejection: rejectionOf("unknown-entity", `Node ${id} does not exist`, [
          id,
        ]),
      };
    }
    switch (action) {
      case "move":
        return model.can({
          kind: "moveNodes",
          moves: (node.group !== undefined &&
          model.reader.getGroup(node.group)?.locked
            ? model.reader.groupMembers(node.group)
            : [node]
          ).map((n) => ({
            node: n.id,
            position: { x: n.position.x + 1, y: n.position.y },
          })),
        });
      case "resize": {
        const limits = model.sizeLimits?.(id) ?? DEFAULT_SIZE_LIMITS;
        const size = trialSize(node.size, limits);
        return size
          ? model.can({ kind: "resizeNode", node: id, size })
          : {
              available: false,
              rejection: rejectionOf(
                "out-of-range",
                `Node ${id} has a fixed size`,
                [id],
              ),
            };
      }
      case "rotate":
        return model.can({ kind: "rotateNodes", nodes: [id], turns: 1 });
      case "mirror":
        return model.can({ kind: "mirrorNodes", nodes: [id] });
      case "delete":
        return model.can({ kind: "deleteEntities", nodes: [id] });
      default:
        return { available: true };
    }
  };
}

/** A size one unit away from `size` inside `limits`, or undefined when none differs. */
function trialSize(size: Size, limits: ResolvedSizeLimits): Size | undefined {
  const clamp = (v: number, lo: number, hi: number) =>
    Math.min(Math.max(v, lo), hi);
  const { width: w, height: h } = size;
  for (const [dw, dh] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    const trial = {
      width: clamp(w + dw, limits.min.width, limits.max.width),
      height: clamp(h + dh, limits.min.height, limits.max.height),
    };
    if (trial.width !== w || trial.height !== h) return trial;
  }
  return undefined;
}
