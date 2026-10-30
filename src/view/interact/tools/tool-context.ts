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
  Viewport,
} from "../../../core/index.js";
import { rejectionOf } from "../../../core/index.js";
import type { ReadonlySelection } from "../selection/selection-model.js";
import { evaluationOf, NO_MODEL_EVALUATION } from "./connect-evaluation.js";
import { resolveToolOptions, type ToolOptions } from "./thresholds.js";
import type { ConnectionEvaluation, ToolContext } from "./tool-types.js";

export interface ToolContextDeps {
  readonly reader: GraphReader;
  readonly scene: Pick<
    GeometryScene,
    "queryRect" | "node" | "connection" | "pick"
  >;
  readonly selection: ReadonlySelection;
  readonly viewport: () => Viewport;
  readonly can: (action: CapabilityAction, id: NodeId) => Availability;
  /** Read on every gesture step, so a getter lets options change at runtime. */
  readonly options?: Partial<ToolOptions> | (() => Partial<ToolOptions>);
  /** Dry-run planner of the model (`GraphModel.plan`); without it nothing can connect. */
  readonly plan?: (command: Command) => PlanResult;
}

export function createToolContext(deps: ToolContextDeps): () => ToolContext {
  const source = deps.options;
  let resolvedFrom: Partial<ToolOptions> | undefined;
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
  return () => {
    const viewport = deps.viewport();
    const options = currentOptions();
    return {
      pick: (world) =>
        deps.scene.pick(world, {
          zoom: viewport.zoom,
          tolerancePx: options.pickTolerancePx,
        }),
      reader: deps.reader,
      scene: deps.scene,
      selection: deps.selection,
      viewport,
      zoom: viewport.zoom,
      can: deps.can,
      evaluateConnection,
      options,
    };
  };
}

/**
 * Capability probe through a model's `can`. Only `move` is needed by the current tools:
 * a one-unit trial move exercises exactly the capability gate a real move would hit.
 */
export function capabilityProbe(model: {
  readonly reader: GraphReader;
  can(command: Command): Availability;
}): (action: CapabilityAction, id: NodeId) => Availability {
  return (action, id) => {
    const node = model.reader.getNode(id);
    if (!node) {
      return {
        available: false,
        reason: rejectionOf("unknown-entity", `Node ${id} does not exist`, [
          id,
        ]),
      };
    }
    switch (action) {
      case "move":
        return model.can({
          kind: "moveNodes",
          moves: [
            {
              node: id,
              position: { x: node.position.x + 1, y: node.position.y },
            },
          ],
        });
      case "delete":
        return model.can({ kind: "deleteEntities", nodes: [id] });
      default:
        return { available: true };
    }
  };
}
