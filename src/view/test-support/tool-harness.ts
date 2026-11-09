/**
 * Headless tool harness: drives tools with `ToolInput` sequences against a real
 * model, geometry scene, selection model and router. The effect runner is the real one;
 * only pointer capture, cursor and the viewport are recorded or held in memory.
 */
import {
  type Command,
  createGeometryScene,
  createGraphModel,
  createRouteRegistry,
  type ExecuteResult,
  type GeometryScene,
  type GraphModel,
  type GraphModelOptions,
  nodeId,
  type Point,
  type RouteRegistry,
  type Vec2,
  type Viewport,
  viewportToWorld,
  worldToViewport,
  zoomAt,
} from "../../core/index.js";
import {
  type ConnSpec,
  graphOps,
  type NodeSpec,
  twoPortNode,
} from "../../core/space/scene/scene-fixtures.js";
import { createEffectRunner } from "../interact/input/effect-runner.js";
import {
  createSelectionModel,
  type SelectionModel,
} from "../interact/selection/selection-model.js";
import { defaultToolSlots } from "../interact/tools/default-tools.js";
import { gestureChangeOf } from "../interact/tools/gesture-change.js";
import type { ToolOptions } from "../interact/tools/thresholds.js";
import {
  capabilityProbe,
  createToolContext,
} from "../interact/tools/tool-context.js";
import {
  createToolRouter,
  type GestureChange,
  type RouteResult,
  type ToolRouter,
  type ToolSlot,
} from "../interact/tools/tool-router.js";
import {
  type ChoiceRelease,
  type CursorKind,
  type GestureCancellation,
  type Modifiers,
  NO_MODIFIERS,
  type ToolInput,
  type ToolPreview,
  type ViewportOp,
} from "../interact/tools/tool-types.js";
import { rerouteEntry } from "../render/paint/previews/ghost-entries.js";
import type { RouteEditorRegistry } from "../render/registries/route-editor-registry.js";

export interface HarnessOptions {
  readonly nodes?: readonly NodeSpec[];
  readonly connections?: readonly ConnSpec[];
  readonly model?: GraphModel;
  readonly modelOptions?: GraphModelOptions;
  readonly viewport?: Viewport;
  readonly tools?: readonly ToolSlot[];
  /** Route registry of the scene; default Bezier for every kind. */
  readonly routes?: RouteRegistry;
  /** Route editors the tool context offers. */
  readonly routeEditors?: RouteEditorRegistry;
  readonly options?: Partial<ToolOptions>;
  /** Port-hiding zoom (the theme's `lodHidePortsBelow`); omitted keeps ports pickable. */
  readonly hidePortsBelow?: number;
  /** Pretend a host connection chooser is installed. */
  readonly chooser?: boolean;
}

export interface ToolHarness {
  readonly model: GraphModel;
  readonly scene: GeometryScene;
  readonly selection: SelectionModel;
  readonly router: ToolRouter;
  viewport(): Viewport;
  /** Apply a viewport effect directly, as the view's viewport state would. */
  applyViewport(op: ViewportOp): void;
  /** Everything the runner was asked to do, in order. */
  readonly log: {
    readonly commits: Command[];
    readonly submits: ExecuteResult[];
    readonly previews: Array<ToolPreview | null>;
    readonly captures: number[];
    readonly releases: number[];
    readonly cursors: CursorKind[];
    /** Releases handed to the connection chooser. */
    readonly chooses: ChoiceRelease[];
  };
  /** Feed one input and execute its effects. */
  send(input: ToolInput): RouteResult;
  /** Gestures the router ended because of a model change, in order. */
  readonly cancellations: GestureCancellation[];
  /**
   * Report a change as if the model had committed it, for origins a local model cannot
   * produce (an external change).
   */
  change(change: GestureChange): RouteResult;
  /** Pointer helpers take world coordinates. */
  down(world: Point<"world">, extra?: PointerExtra): RouteResult;
  move(world: Point<"world">, extra?: PointerExtra): RouteResult;
  up(world: Point<"world">, extra?: PointerExtra): RouteResult;
  key(key: string, type?: "key-down" | "key-up", mods?: Modifiers): RouteResult;
  dispose(): void;
}

export interface PointerExtra {
  readonly button?: 0 | 1 | 2;
  readonly modifiers?: Partial<Modifiers>;
  readonly pointerId?: number;
}

/**
 * A 40x20 node with ports on its left and right edges whose top-left corner is at
 * `(x, y)`. Node positions are body centers, so tests can think in corner coordinates.
 */
export function cornerNode(id: string, x: number, y: number): NodeSpec {
  return twoPortNode(id, x + 20, y + 10);
}

/** Top-left corner of a 40x20 node (inverse of `cornerNode`). */
export function cornerOf(h: ToolHarness, id: string): Vec2 | undefined {
  const p = h.model.reader.getNode(nodeId(id))?.position;
  return p && { x: p.x - 20, y: p.y - 10 };
}

export function createToolHarness(opts: HarnessOptions = {}): ToolHarness {
  const model = opts.model ?? createGraphModel(opts.modelOptions);
  if (!opts.model && (opts.nodes || opts.connections)) {
    const r = model.submit({
      ops: graphOps(opts.nodes ?? [], opts.connections ?? []),
    });
    if (r.status !== "accepted") throw new Error("harness fixture rejected");
  }
  const routes = opts.routes ?? createRouteRegistry();
  const scene = createGeometryScene(model, { routes });
  const selection = createSelectionModel();
  const stopBinding = selection.bindToModel(model);
  let viewport: Viewport = opts.viewport ?? { zoom: 1, panX: 0, panY: 0 };
  const router = createToolRouter(opts.tools ?? defaultToolSlots());
  const context = createToolContext({
    reader: model.reader,
    scene,
    selection,
    viewport: () => viewport,
    can: capabilityProbe(model),
    sizeLimits: model.sizeLimits,
    plan: model.plan,
    ...(opts.options ? { options: opts.options } : {}),
    chooserInstalled: () => opts.chooser === true,
    ...(opts.routeEditors ? { routeEditors: opts.routeEditors } : {}),
    reroute: (entry, route) =>
      rerouteEntry(entry, route, { reader: model.reader, scene, routes }),
    ...(opts.hidePortsBelow !== undefined
      ? { hidePortsBelow: () => opts.hidePortsBelow ?? 0 }
      : {}),
  });
  const log: ToolHarness["log"] = {
    commits: [],
    submits: [],
    previews: [],
    captures: [],
    releases: [],
    cursors: [],
    chooses: [],
  };
  function applyViewport(op: ViewportOp): void {
    switch (op.kind) {
      case "panBy":
        viewport = {
          ...viewport,
          panX: viewport.panX + op.dx,
          panY: viewport.panY + op.dy,
        };
        break;
      case "zoomAt": {
        const next = zoomAt(viewport, viewport.zoom * op.factor, op.anchor);
        if (next.ok) viewport = next.value;
        break;
      }
      case "set":
        viewport = op.viewport;
        break;
    }
  }
  const run = createEffectRunner({
    capture: (id) => void log.captures.push(id),
    release: (id) => void log.releases.push(id),
    cursor: (c) => void log.cursors.push(c),
    preview: (p) => void log.previews.push(p),
    commit(command) {
      log.commits.push(command);
      log.submits.push(model.execute(command));
    },
    selection,
    viewport: applyViewport,
    choose: (request) => void log.chooses.push(request),
  });

  // Like the mounted view: every committed change tells the router.
  const cancellations: GestureCancellation[] = [];
  const change = (c: GestureChange): RouteResult => {
    const result = router.changed(c, context());
    run(result.effects);
    if (result.cancelled) cancellations.push(result.cancelled);
    return result;
  };
  const stopChanges = model.on(
    "change",
    (e) => void change(gestureChangeOf(e)),
  );

  let time = 0;
  const send = (input: ToolInput): RouteResult => {
    const result = router.handle(input, context());
    run(result.effects);
    return result;
  };
  const pointer =
    (type: "pointer-down" | "pointer-move" | "pointer-up") =>
    (world: Point<"world">, extra: PointerExtra = {}): RouteResult =>
      send({
        type,
        pointerId: extra.pointerId ?? 1,
        button: extra.button ?? 0,
        world,
        viewport: worldToViewport(viewport, world),
        modifiers: { ...NO_MODIFIERS, ...extra.modifiers },
        time: time++,
      });

  return {
    model,
    scene,
    selection,
    router,
    viewport: () => viewport,
    applyViewport,
    log,
    send,
    cancellations,
    change,
    down: pointer("pointer-down"),
    move: pointer("pointer-move"),
    up: pointer("pointer-up"),
    key: (key, type = "key-down", mods = NO_MODIFIERS) =>
      send({ type, key, modifiers: mods }),
    dispose() {
      stopChanges();
      stopBinding();
      selection.dispose();
      scene.dispose();
    },
  };
}

export { viewportToWorld };
