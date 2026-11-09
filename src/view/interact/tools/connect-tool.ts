/**
 * Connect tool (D7): drag from a port to another.
 *
 * A press on a port arms the gesture; past the drag threshold a provisional path follows
 * the pointer and snaps to the nearest compatible port. Releasing on a compatible port
 * commits exactly one `connect` command. Releasing on a port for which the policy offers
 * several alternatives asks the host chooser (a `choose` effect, preview kept) or, with
 * none installed, commits nothing. Releasing anywhere else, Escape, a
 * removed source, or any other cancellation submits nothing.
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
  const state = preview.candidates[0]?.evaluation.state;
  return state === undefined || state === "compatible" || state === "choice"
    ? "crosshair"
    : "not-allowed";
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

export const connectTool: Tool<ConnectState> = {
  id: "connect",
  idle: IDLE,
  accepts: ({ input, hits, spaceHeld }) =>
    input.button === 0 && !spaceHeld && portAt(hits) !== undefined,
  isIdle: (state) => state.kind === "idle",
  autoPans: (state) => state.kind === "dragging",
  involved: (state) =>
    state.kind === "idle" ? [] : [state.source.node, state.source.port],
  transition(state, input, ctx) {
    if (state.kind === "idle") return idle(input, ctx);
    const own =
      (input.type === "pointer-move" || input.type === "pointer-up") &&
      input.pointerId === state.pointerId;
    if (input.type === "cancel") {
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
    const { target, candidates } = connectPreview(
      state.source,
      input.world,
      ctx,
    );
    const evaluation = candidates.find(
      (c) => c.endpoint === target,
    )?.evaluation;
    if (!target || !evaluation) return { state: IDLE, effects: END };
    if (evaluation.state === "choice") {
      if (!ctx.chooserInstalled) return { state: IDLE, effects: END };
      const request = {
        source: state.source,
        target,
        alternatives: evaluation.alternatives ?? [],
        at: input.world,
      };
      // The preview stays frozen while the host chooses.
      return {
        state: IDLE,
        effects: [
          { type: "cursor", cursor: "default" },
          { type: "choose", request },
        ],
      };
    }
    return {
      state: IDLE,
      effects: [
        ...END,
        {
          type: "commit",
          command: { kind: "connect", from: state.source, to: target },
        },
      ],
    };
  },
};
