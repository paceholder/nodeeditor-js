/**
 * Select and move tool (D5, D6).
 *
 * A press on a node, a connection or a group frame (its title strip or border) updates
 * the selection immediately; past the drag threshold a press on a node or a frame becomes
 * a move of the whole selection. A selected group moves all its members, and a member of
 * a locked group brings the whole group along. Nothing is submitted until release, which
 * commits one `moveNodes` command for the permitted nodes, carrying the membership
 * changes of the drop (`group-drop.ts`). Locked nodes stay in place and are marked in
 * the preview.
 */

import type {
  ConnectionId,
  GroupId,
  HitCandidate,
  NodeId,
  Point,
  Vec2,
} from "../../../core/index.js";
import { deepFreeze } from "../../platform/deep-freeze.js";
import { nodesToMove } from "../selection/moved-nodes.js";
import {
  applySelectionChange,
  connectionKey,
  groupKey,
  nodeKey,
  type SelectionChange,
  type SelectionKey,
} from "../selection/selection-model.js";
import { type GroupDrop, groupDrop } from "./group-drop.js";
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
  | { readonly kind: "connection"; readonly id: ConnectionId }
  | { readonly kind: "group"; readonly id: GroupId };

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
      /** Membership changes and frames the drop would make at `offset`. */
      readonly drop: GroupDrop;
    };

const IDLE: SelectMoveState = { kind: "idle" };
const CLEAR_PREVIEW: ToolEffect = { type: "preview", preview: null };

function targetOf(
  hits: readonly HitCandidate[],
  ctx: ToolContext,
): Target | undefined {
  for (const hit of hits) {
    if (hit.kind === "node") return { kind: "node", id: hit.nodeId };
    if (hit.kind === "connection")
      return { kind: "connection", id: hit.connectionId };
    // A frame is grabbed by its title strip or border; group hits come last.
    if (hit.kind === "group" && ctx.options.groups !== false)
      return { kind: "group", id: hit.groupId };
  }
  return undefined;
}

function keyOf(target: Target): SelectionKey {
  switch (target.kind) {
    case "node":
      return nodeKey(target.id);
    case "connection":
      return connectionKey(target.id);
    case "group":
      return groupKey(target.id);
  }
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
  const { movable, locked } = partitionMovable(
    nodesToMove(state.selected, ctx.reader),
    ctx,
  );
  const pressedId = state.target.kind === "node" ? state.target.id : undefined;
  return {
    kind: "dragging",
    pointerId: state.pointerId,
    startWorld: state.startWorld,
    movable,
    locked,
    anchor: movable.find((m) => m.id === pressedId) ?? movable[0],
    offset: { x: 0, y: 0 },
    drop: { membership: [], frames: [] },
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
  const moving = state.movable.map((m) => m.id);
  const drop = groupDrop(
    ctx,
    moving,
    offset,
    input.world,
    ctx.options.groups !== false && ctx.options.groups.dragMembership,
  );
  return {
    state: { ...state, offset, drop },
    effects: [
      {
        type: "preview",
        preview: {
          kind: "move",
          offset,
          moving,
          locked: state.locked,
          ...(drop.frames.length > 0 ? { groups: drop.frames } : {}),
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
        ...(state.drop.membership.length > 0
          ? { membership: state.drop.membership }
          : {}),
      },
    });
  }
  return { state: IDLE, effects };
}

export const selectMoveTool: Tool<SelectMoveState> = deepFreeze({
  id: "select-move",
  idle: IDLE,
  accepts: ({ input, hits, spaceHeld }, ctx) =>
    input.button === 0 && !spaceHeld && targetOf(hits, ctx) !== undefined,
  isIdle: (state) => state.kind === "idle",
  autoPans: (state) => state.kind === "dragging",
  involved(state) {
    switch (state.kind) {
      case "idle":
        return [];
      case "pressed":
        return [state.target.id];
      case "dragging":
        return [...state.movable.map((m) => m.id), ...state.locked];
    }
  },
  transition(state, input, ctx) {
    switch (state.kind) {
      case "idle": {
        if (input.type !== "pointer-down") return { state, effects: [] };
        const target = targetOf(ctx.pick(input.world), ctx);
        return target ? press(input, target, ctx) : { state, effects: [] };
      }
      case "pressed": {
        if (
          input.type === "pointer-move" &&
          input.pointerId === state.pointerId
        ) {
          const moved = distancePx(input.viewport, state.startViewport);
          if (
            state.target.kind === "connection" ||
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
        return { state, effects: [] };
      }
    }
  },
});
