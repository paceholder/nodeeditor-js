/**
 * Route-edit tool (D7).
 *
 * Claims a primary press on a handle of a selected connection whose kind has a route
 * editor; it sits before `selectMove`, so the press never starts a node move or changes
 * the selection. Past the drag threshold the editor turns the pointer into constraints,
 * shown as a `route` preview, and release commits one `setRoute` (a drag that ends where
 * it started commits nothing). Escape and every other cancel discard the preview. A second
 * press on the same handle within `doubleClickMs` is a double-click: the editor's
 * `activate` result is committed on release. Which handles exist and what they do is the
 * editor's business; this file knows only the contract.
 *
 * The tool remembers the last click to recognize a double-click, so it is created per
 * view (`createRouteEditTool`); the transition is otherwise a pure function of its state.
 */
import type {
  ConnectionId,
  HitCandidate,
  Point,
  RouteConstraint,
} from "../../../core/index.js";
import type {
  RouteEditor,
  RouteHandle,
} from "../../render/registries/route-editor-registry.js";
import { connectionKey } from "../selection/selection-model.js";
import { distancePx, dragThreshold } from "./thresholds.js";
import type {
  CursorKind,
  PointerInput,
  PointerType,
  Tool,
  ToolContext,
  ToolEffect,
  Transition,
} from "./tool-types.js";

interface Grip {
  readonly pointerId: number;
  readonly connection: ConnectionId;
  readonly handle: RouteHandle;
  readonly startWorld: Point<"world">;
}

export type RouteEditState =
  | { readonly kind: "idle" }
  | (Grip & {
      readonly kind: "pressed";
      readonly pointerType: PointerType | undefined;
      readonly startViewport: Point<"viewport">;
      readonly time: number;
      /** Second press of a double-click. */
      readonly double: boolean;
    })
  | (Grip & {
      readonly kind: "dragging";
      readonly route: readonly RouteConstraint[];
    });

interface Click {
  readonly connection: ConnectionId;
  readonly handle: string;
  readonly time: number;
  readonly viewport: Point<"viewport">;
}

interface Target {
  readonly connection: ConnectionId;
  readonly editor: RouteEditor;
  readonly handle: RouteHandle;
}

const IDLE: RouteEditState = { kind: "idle" };
const CLEAR_PREVIEW: ToolEffect = { type: "preview", preview: null };
const DEFAULT_CURSOR: ToolEffect = { type: "cursor", cursor: "default" };

/**
 * The handle a press or hover at `world` takes: the topmost node or connection must be a
 * selected connection with an editor that finds a handle there. Shared by the tool and
 * the hover cursor, so the cursor, the grips and the press agree.
 */
export function routeTargetAt(
  world: Point<"world">,
  hits: readonly HitCandidate[],
  ctx: ToolContext,
): Target | undefined {
  const top = hits.find((h) => h.kind === "node" || h.kind === "connection");
  if (top?.kind !== "connection") return undefined;
  const connection = top.connectionId;
  if (!ctx.selection.has(connectionKey(connection))) return undefined;
  const entry = ctx.scene.connection(connection);
  const editor = entry && ctx.routeEditors.get(entry.record.kind);
  if (!entry || !editor) return undefined;
  const handle = editor.hit(
    entry,
    world,
    ctx.options.pickTolerancePx / ctx.zoom,
  );
  return handle && { connection, editor, handle };
}

/** The resize cursor over a route handle of a selected connection, else undefined. */
export function routeCursorAt(
  world: Point<"world">,
  ctx: ToolContext,
): CursorKind | undefined {
  const target = routeTargetAt(world, ctx.pick(world), ctx);
  return target?.editor.cursor(target.handle);
}

const sameRoute = (
  a: readonly RouteConstraint[],
  b: readonly RouteConstraint[],
): boolean =>
  a.length === b.length &&
  a.every((c, i) => c.orientation === b[i]?.orientation && c.at === b[i]?.at);

export function createRouteEditTool(): Tool<RouteEditState> {
  let last: Click | undefined;

  const entryOf = (state: Grip, ctx: ToolContext) => {
    const entry = ctx.scene.connection(state.connection);
    const editor = entry && ctx.routeEditors.get(entry.record.kind);
    return entry && editor ? { entry, editor } : undefined;
  };

  function press(
    input: PointerInput,
    target: Target,
    ctx: ToolContext,
  ): Transition<RouteEditState> {
    const isDouble =
      last !== undefined &&
      last.connection === target.connection &&
      last.handle === target.handle.id &&
      input.time - last.time <= ctx.options.doubleClickMs &&
      distancePx(input.viewport, last.viewport) <=
        dragThreshold(ctx.options, input.pointerType);
    return {
      state: {
        kind: "pressed",
        pointerId: input.pointerId,
        pointerType: input.pointerType,
        startViewport: input.viewport,
        startWorld: input.world,
        connection: target.connection,
        handle: target.handle,
        time: input.time,
        double: isDouble,
      },
      effects: [
        { type: "cursor", cursor: target.editor.cursor(target.handle) },
      ],
    };
  }

  function drag(
    state: Grip,
    input: PointerInput,
    ctx: ToolContext,
  ): Transition<RouteEditState> {
    const found = entryOf(state, ctx);
    if (!found)
      return { state: IDLE, effects: [CLEAR_PREVIEW, DEFAULT_CURSOR] };
    const route = found.editor.drag(
      found.entry,
      state.handle,
      state.startWorld,
      input.world,
    );
    return {
      state: { ...state, kind: "dragging", route },
      effects: [
        {
          type: "preview",
          preview: { kind: "route", connection: state.connection, route },
        },
      ],
    };
  }

  function releaseDrag(
    state: Extract<RouteEditState, { kind: "dragging" }>,
    ctx: ToolContext,
  ): Transition<RouteEditState> {
    const effects: ToolEffect[] = [CLEAR_PREVIEW, DEFAULT_CURSOR];
    const before = ctx.scene.connection(state.connection)?.record.route ?? [];
    if (!sameRoute(before, state.route)) {
      effects.push({
        type: "commit",
        command: {
          kind: "setRoute",
          connection: state.connection,
          route: state.route,
        },
      });
    }
    return { state: IDLE, effects };
  }

  function releaseClick(
    state: Extract<RouteEditState, { kind: "pressed" }>,
    input: PointerInput,
    ctx: ToolContext,
  ): Transition<RouteEditState> {
    const effects: ToolEffect[] = [DEFAULT_CURSOR];
    if (!state.double) {
      last = {
        connection: state.connection,
        handle: state.handle.id,
        time: state.time,
        viewport: input.viewport,
      };
      return { state: IDLE, effects };
    }
    last = undefined;
    const found = entryOf(state, ctx);
    const route = found?.editor.activate(found.entry, state.handle);
    if (route) {
      effects.push({
        type: "commit",
        command: { kind: "setRoute", connection: state.connection, route },
      });
    }
    return { state: IDLE, effects };
  }

  const own = (input: PointerInput, state: Grip): boolean =>
    input.pointerId === state.pointerId;

  return {
    id: "route-edit",
    idle: IDLE,
    accepts: ({ input, hits, spaceHeld }, ctx) =>
      input.button === 0 &&
      !spaceHeld &&
      routeTargetAt(input.world, hits, ctx) !== undefined,
    isIdle: (state) => state.kind === "idle",
    autoPans: (state) => state.kind === "dragging",
    transition(state, input, ctx) {
      switch (state.kind) {
        case "idle": {
          if (input.type !== "pointer-down") return { state, effects: [] };
          const target = routeTargetAt(input.world, ctx.pick(input.world), ctx);
          return target ? press(input, target, ctx) : { state, effects: [] };
        }
        case "pressed": {
          if (input.type === "pointer-move" && own(input, state)) {
            const moved = distancePx(input.viewport, state.startViewport);
            if (moved <= dragThreshold(ctx.options, state.pointerType)) {
              return { state, effects: [] };
            }
            last = undefined;
            return drag(state, input, ctx);
          }
          if (input.type === "pointer-up" && own(input, state)) {
            return releaseClick(state, input, ctx);
          }
          if (
            input.type === "cancel" ||
            (input.type === "entities-removed" &&
              input.ids.includes(state.connection))
          ) {
            return { state: IDLE, effects: [DEFAULT_CURSOR] };
          }
          return { state, effects: [] };
        }
        case "dragging": {
          if (input.type === "pointer-move" && own(input, state)) {
            return drag(state, input, ctx);
          }
          if (input.type === "pointer-up" && own(input, state)) {
            return releaseDrag(state, ctx);
          }
          if (
            input.type === "cancel" ||
            (input.type === "entities-removed" &&
              input.ids.includes(state.connection))
          ) {
            return { state: IDLE, effects: [CLEAR_PREVIEW, DEFAULT_CURSOR] };
          }
          return { state, effects: [] };
        }
      }
    },
  };
}
