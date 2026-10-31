/**
 * Select and move tool (INT-02, INT-03, INT-05, INT-08, MOD-11, D5, D6).
 *
 * A press on a node or connection updates the selection immediately; past the drag
 * threshold a press on a node becomes a move of the whole selection. Nothing is
 * submitted until release, which commits one `moveNodes` command for the permitted
 * nodes. Locked nodes stay in place and are marked in the preview.
 */
import {
  type ConnectionId,
  type HitCandidate,
  type NodeId,
  nodeId,
  type Point,
  type Vec2,
} from "../../../core/index.js";
import {
  applySelectionChange,
  connectionKey,
  nodeKey,
  type SelectionChange,
  type SelectionKey,
} from "../selection/selection-model.js";
import {
  dragOffset,
  type MoveOrigin,
  partitionMovable,
} from "./move-offset.js";
import { distancePx, dragThreshold } from "./thresholds.js";
import type {
  PointerDownInput,
  PointerMoveInput,
  PointerType,
  Tool,
  ToolContext,
  ToolEffect,
  Transition,
} from "./tool-types.js";

type Target =
  | { readonly kind: "node"; readonly id: NodeId }
  | { readonly kind: "connection"; readonly id: ConnectionId };

export type SelectMoveState =
  | { readonly kind: "idle" }
  | {
      readonly kind: "pressed";
      readonly pointerId: number;
      readonly pointerType: PointerType | undefined;
      readonly startViewport: Point<"viewport">;
      readonly startWorld: Point<"world">;
      readonly target: Target;
      /** Selection right after the press; the set a drag would move. */
      readonly selected: readonly SelectionKey[];
      /** Applied on release when no drag happened (click on an already-selected item). */
      readonly onClick: SelectionChange | undefined;
    }
  | {
      readonly kind: "dragging";
      readonly pointerId: number;
      readonly startWorld: Point<"world">;
      readonly movable: readonly MoveOrigin[];
      readonly locked: readonly NodeId[];
      readonly anchor: MoveOrigin | undefined;
      readonly offset: Vec2;
    };

const IDLE: SelectMoveState = { kind: "idle" };
const CLEAR_PREVIEW: ToolEffect = { type: "preview", preview: null };

function targetOf(hits: readonly HitCandidate[]): Target | undefined {
  for (const hit of hits) {
    if (hit.kind === "node") return { kind: "node", id: hit.nodeId };
    if (hit.kind === "connection")
      return { kind: "connection", id: hit.connectionId };
  }
  return undefined;
}

function keyOf(target: Target): SelectionKey {
  return target.kind === "node" ? nodeKey(target.id) : connectionKey(target.id);
}

function press(
  input: PointerDownInput,
  target: Target,
  ctx: ToolContext,
): Transition<SelectMoveState> {
  const key = keyOf(target);
  const isSelected = ctx.selection.has(key);
  const { shift, mod } = input.modifiers;
  let change: SelectionChange | undefined;
  let onClick: SelectionChange | undefined;
  if (mod) {
    if (isSelected) onClick = { mode: "toggle", keys: [key] };
    else change = { mode: "add", keys: [key] };
  } else if (shift) {
    if (!isSelected) change = { mode: "add", keys: [key] };
  } else if (isSelected) {
    onClick = { mode: "replace", keys: [key] };
  } else {
    change = { mode: "replace", keys: [key] };
  }
  const selected = change
    ? applySelectionChange(ctx.selection.keys(), change)
    : ctx.selection.keys();
  return {
    state: {
      kind: "pressed",
      pointerId: input.pointerId,
      pointerType: input.pointerType,
      startViewport: input.viewport,
      startWorld: input.world,
      target,
      selected,
      onClick,
    },
    effects: change ? [{ type: "select", change }] : [],
  };
}

type Dragging = Extract<SelectMoveState, { kind: "dragging" }>;

function startDrag(
  state: Extract<SelectMoveState, { kind: "pressed" }>,
  ctx: ToolContext,
): Dragging {
  const ids = state.selected
    .filter((k) => k.startsWith("n:"))
    .map((k) => nodeId(k.slice(2)));
  const { movable, locked } = partitionMovable(ids, ctx);
  const pressedId = state.target.kind === "node" ? state.target.id : undefined;
  return {
    kind: "dragging",
    pointerId: state.pointerId,
    startWorld: state.startWorld,
    movable,
    locked,
    anchor: movable.find((m) => m.id === pressedId) ?? movable[0],
    offset: { x: 0, y: 0 },
  };
}

function drag(
  state: Dragging,
  input: PointerMoveInput,
  ctx: ToolContext,
): Transition<SelectMoveState> {
  const offset = dragOffset(
    state.startWorld,
    input.world,
    state.anchor,
    ctx.options.gridStep,
    input.modifiers.alt,
  );
  return {
    state: { ...state, offset },
    effects: [
      {
        type: "preview",
        preview: {
          kind: "move",
          offset,
          moving: state.movable.map((m) => m.id),
          locked: state.locked,
        },
      },
    ],
  };
}

function release(state: Dragging): Transition<SelectMoveState> {
  const { offset } = state;
  const effects: ToolEffect[] = [CLEAR_PREVIEW];
  // A zero offset (after snapping) or nothing movable commits nothing.
  if (state.movable.length > 0 && (offset.x !== 0 || offset.y !== 0)) {
    effects.push({
      type: "commit",
      command: {
        kind: "moveNodes",
        moves: state.movable.map((m) => ({
          node: m.id,
          position: { x: m.position.x + offset.x, y: m.position.y + offset.y },
        })),
      },
    });
  }
  return { state: IDLE, effects };
}

export const selectMoveTool: Tool<SelectMoveState> = {
  id: "select-move",
  idle: IDLE,
  accepts: ({ input, hits, spaceHeld }) =>
    input.button === 0 && !spaceHeld && targetOf(hits) !== undefined,
  isIdle: (state) => state.kind === "idle",
  autoPans: (state) => state.kind === "dragging",
  transition(state, input, ctx) {
    switch (state.kind) {
      case "idle": {
        if (input.type !== "pointer-down") return { state, effects: [] };
        const target = targetOf(ctx.pick(input.world));
        return target ? press(input, target, ctx) : { state, effects: [] };
      }
      case "pressed": {
        if (
          input.type === "pointer-move" &&
          input.pointerId === state.pointerId
        ) {
          const moved = distancePx(input.viewport, state.startViewport);
          if (
            state.target.kind !== "node" ||
            moved <= dragThreshold(ctx.options, state.pointerType)
          ) {
            return { state, effects: [] };
          }
          return drag(startDrag(state, ctx), input, ctx);
        }
        if (
          input.type === "pointer-up" &&
          input.pointerId === state.pointerId
        ) {
          return {
            state: IDLE,
            effects: state.onClick
              ? [{ type: "select", change: state.onClick }]
              : [],
          };
        }
        if (input.type === "cancel") return { state: IDLE, effects: [] };
        if (
          input.type === "entities-removed" &&
          input.ids.includes(state.target.id)
        ) {
          return { state: IDLE, effects: [] };
        }
        return { state, effects: [] };
      }
      case "dragging": {
        if (
          input.type === "pointer-move" &&
          input.pointerId === state.pointerId
        ) {
          return drag(state, input, ctx);
        }
        if (
          input.type === "pointer-up" &&
          input.pointerId === state.pointerId
        ) {
          return release(state);
        }
        if (input.type === "cancel") {
          return { state: IDLE, effects: [CLEAR_PREVIEW] };
        }
        if (
          input.type === "entities-removed" &&
          [...state.movable.map((m) => m.id), ...state.locked].some((id) =>
            input.ids.includes(id),
          )
        ) {
          return { state: IDLE, effects: [CLEAR_PREVIEW] };
        }
        return { state, effects: [] };
      }
    }
  },
};
