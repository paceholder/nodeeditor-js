/**
 * Connect tool (INT-04, INT-05, INT-08, CON-03, PRT-06, D7): drag from a port to another.
 *
 * A press on a port arms the gesture; past the drag threshold a provisional path follows
 * the pointer and snaps to the nearest compatible port. Releasing on a compatible port
 * commits exactly one `connect` command; releasing anywhere else, Escape, a removed
 * source, or any other cancellation submits nothing, so no dangling connection exists.
 * A press-release below the threshold selects the port's node instead.
 */
import type { Endpoint, Point } from "../../../core/index.js";
import { nodeKey, type SelectionChange } from "../selection/selection-model.js";
import { connectPreview, portAt } from "./connect-candidates.js";
import { distancePx, dragThreshold } from "./thresholds.js";
import type {
  CursorKind,
  PointerType,
  Tool,
  ToolContext,
  ToolEffect,
  ToolInput,
  ToolPreview,
  Transition,
} from "./tool-types.js";

export type ConnectState =
  | { readonly kind: "idle" }
  | {
      readonly kind: "pressed";
      readonly pointerId: number;
      readonly pointerType: PointerType | undefined;
      readonly startViewport: Point<"viewport">;
      readonly source: Endpoint;
      readonly select: SelectionChange;
    }
  | {
      readonly kind: "dragging";
      readonly pointerId: number;
      readonly source: Endpoint;
    };

const IDLE: ConnectState = { kind: "idle" };
const END: readonly ToolEffect[] = [
  { type: "preview", preview: null },
  { type: "cursor", cursor: "default" },
];

function cursorFor(
  preview: Extract<ToolPreview, { kind: "connect" }>,
): CursorKind {
  const hovered = preview.candidates[0];
  return hovered && hovered.evaluation.state !== "compatible"
    ? "not-allowed"
    : "crosshair";
}

function follow(
  source: Endpoint,
  pointerId: number,
  at: Point<"world">,
  ctx: ToolContext,
): Transition<ConnectState> {
  const preview = connectPreview(source, at, ctx);
  return {
    state: { kind: "dragging", pointerId, source },
    effects: [
      { type: "preview", preview },
      { type: "cursor", cursor: cursorFor(preview) },
    ],
  };
}

function idle(input: ToolInput, ctx: ToolContext): Transition<ConnectState> {
  if (input.type !== "pointer-down") return { state: IDLE, effects: [] };
  const source = portAt(ctx.pick(input.world));
  if (!source) return { state: IDLE, effects: [] };
  const key = nodeKey(source.node);
  return {
    state: {
      kind: "pressed",
      pointerId: input.pointerId,
      pointerType: input.pointerType,
      startViewport: input.viewport,
      source,
      select: { mode: input.modifiers.shift ? "add" : "replace", keys: [key] },
    },
    effects: [],
  };
}

function removed(ids: readonly string[], source: Endpoint): boolean {
  return ids.includes(source.node) || ids.includes(source.port);
}

export const connectTool: Tool<ConnectState> = {
  id: "connect",
  idle: IDLE,
  accepts: ({ input, hits, spaceHeld }) =>
    input.button === 0 && !spaceHeld && portAt(hits) !== undefined,
  isIdle: (state) => state.kind === "idle",
  autoPans: (state) => state.kind === "dragging",
  transition(state, input, ctx) {
    if (state.kind === "idle") return idle(input, ctx);
    const own =
      (input.type === "pointer-move" || input.type === "pointer-up") &&
      input.pointerId === state.pointerId;
    if (input.type === "cancel") {
      return { state: IDLE, effects: state.kind === "dragging" ? END : [] };
    }
    if (input.type === "entities-removed") {
      if (!removed(input.ids, state.source)) return { state, effects: [] };
      return { state: IDLE, effects: state.kind === "dragging" ? END : [] };
    }
    if (!own) return { state, effects: [] };
    if (state.kind === "pressed") {
      if (input.type === "pointer-up") {
        return {
          state: IDLE,
          effects: [{ type: "select", change: state.select }],
        };
      }
      const moved = distancePx(input.viewport, state.startViewport);
      return moved <= dragThreshold(ctx.options, state.pointerType)
        ? { state, effects: [] }
        : follow(state.source, state.pointerId, input.world, ctx);
    }
    if (input.type === "pointer-move") {
      return follow(state.source, state.pointerId, input.world, ctx);
    }
    // Release: the target is decided at the release point, against the live model.
    const { target } = connectPreview(state.source, input.world, ctx);
    return {
      state: IDLE,
      effects: target
        ? [
            ...END,
            {
              type: "commit",
              command: { kind: "connect", from: state.source, to: target },
            },
          ]
        : END,
    };
  },
};
