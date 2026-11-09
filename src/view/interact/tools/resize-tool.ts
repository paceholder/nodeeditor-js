/**
 * Resize tool (D7).
 *
 * Claims a primary press on the resize handle of the single selected node when the
 * resize capability allows it; the router asks it before `connect`, so a port under the
 * handle never starts a connection there. Past the drag threshold the pointer drives a
 * `resize` preview (local delta, grid, aspect, limits: `resize-math.ts`). Release
 * commits one `resizeNode` with the opposite corner fixed; below the threshold nothing
 * is committed. Every cancel, and removal of the node, discards the preview.
 */

import type {
  NodeId,
  Point,
  ResizeFixed,
  Size,
  Vec2,
} from "../../../core/index.js";
import { deepFreeze } from "../../platform/deep-freeze.js";
import {
  hitsResizeHandle,
  type LocalCorner,
  resizeHandleOf,
} from "../../render/paint/previews/resize-handle.js";
import type { ReadonlySelection } from "../selection/selection-model.js";
import { fixedFor, type ResizeStart, resizeStep } from "./resize-math.js";
import { distancePx, dragThreshold } from "./thresholds.js";
import type {
  PointerInput,
  PointerMoveInput,
  PointerType,
  Tool,
  ToolContext,
  ToolEffect,
  Transition,
} from "./tool-types.js";

interface Grip {
  readonly pointerId: number;
  readonly press: Point<"world">;
  readonly node: NodeId;
  readonly corner: LocalCorner;
  readonly start: ResizeStart;
}

export type ResizeState =
  | { readonly kind: "idle" }
  | (Grip & {
      readonly kind: "pressed";
      readonly pointerType: PointerType | undefined;
      readonly startViewport: Point<"viewport">;
    })
  | (Grip & {
      readonly kind: "dragging";
      readonly size: Size;
      readonly position: Vec2;
    });

const IDLE: ResizeState = { kind: "idle" };
const CLEAR_PREVIEW: ToolEffect = { type: "preview", preview: null };
const DEFAULT_CURSOR: ToolEffect = { type: "cursor", cursor: "default" };

/** The node that may carry a handle: the only selected entity, when it is a node. */
export function resizeTargetOf(
  selection: Pick<ReadonlySelection, "size" | "nodeIds">,
): NodeId | undefined {
  if (selection.size !== 1) return undefined;
  return selection.nodeIds()[0];
}

/** The grip a press at `world` takes, or undefined when it misses the handle. */
function gripAt(
  world: Point<"world">,
  ctx: ToolContext,
): Omit<Grip, "pointerId" | "press"> | undefined {
  const node = resizeTargetOf(ctx.selection);
  if (!node) return undefined;
  const entry = ctx.scene.node(node);
  if (!entry || !ctx.can("resize", node).available) return undefined;
  const handle = resizeHandleOf(entry, ctx.zoom);
  if (!hitsResizeHandle(handle, world)) return undefined;
  return { node, corner: handle.corner, start: entry };
}

function drag(
  state: Grip,
  input: PointerMoveInput,
  ctx: ToolContext,
): Transition<ResizeState> {
  const { size, position } = resizeStep(state.start, state.corner, {
    press: state.press,
    pointer: input.world,
    keepAspect: input.modifiers.shift,
    gridStep: ctx.options.gridStep,
    suppressSnap: input.modifiers.alt,
    limits: ctx.sizeLimits(state.node),
  });
  const fixed: ResizeFixed = fixedFor(state.corner);
  return {
    state: {
      kind: "dragging",
      pointerId: state.pointerId,
      press: state.press,
      node: state.node,
      corner: state.corner,
      start: state.start,
      size,
      position,
    },
    effects: [
      {
        type: "preview",
        preview: { kind: "resize", node: state.node, size, position, fixed },
      },
    ],
  };
}

function release(
  state: Extract<ResizeState, { kind: "dragging" }>,
): Transition<ResizeState> {
  const effects: ToolEffect[] = [CLEAR_PREVIEW, DEFAULT_CURSOR];
  const before = state.start.record.size;
  if (
    state.size.width !== before.width ||
    state.size.height !== before.height
  ) {
    effects.push({
      type: "commit",
      command: {
        kind: "resizeNode",
        node: state.node,
        size: state.size,
        fixed: fixedFor(state.corner),
      },
    });
  }
  return { state: IDLE, effects };
}

const own = (input: PointerInput, state: Grip): boolean =>
  input.pointerId === state.pointerId;

export const resizeTool: Tool<ResizeState> = deepFreeze({
  id: "resize",
  idle: IDLE,
  accepts: ({ input, spaceHeld }, ctx) =>
    input.button === 0 && !spaceHeld && gripAt(input.world, ctx) !== undefined,
  isIdle: (state) => state.kind === "idle",
  autoPans: (state) => state.kind === "dragging",
  involved: (state) => (state.kind === "idle" ? [] : [state.node]),
  transition(state, input, ctx) {
    switch (state.kind) {
      case "idle": {
        if (input.type !== "pointer-down") return { state, effects: [] };
        const grip = gripAt(input.world, ctx);
        if (!grip) return { state, effects: [] };
        return {
          state: {
            kind: "pressed",
            ...grip,
            pointerId: input.pointerId,
            pointerType: input.pointerType,
            startViewport: input.viewport,
            press: input.world,
          },
          effects: [{ type: "cursor", cursor: "nwse-resize" }],
        };
      }
      case "pressed": {
        if (input.type === "pointer-move" && own(input, state)) {
          const moved = distancePx(input.viewport, state.startViewport);
          return moved <= dragThreshold(ctx.options, state.pointerType)
            ? { state, effects: [] }
            : drag(state, input, ctx);
        }
        if (
          (input.type === "pointer-up" && own(input, state)) ||
          input.type === "cancel"
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
          return release(state);
        }
        if (input.type === "cancel") {
          return { state: IDLE, effects: [CLEAR_PREVIEW, DEFAULT_CURSOR] };
        }
        return { state, effects: [] };
      }
    }
  },
});
