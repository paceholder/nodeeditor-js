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
import { type Endpoint, type Point, rejectionOf } from "../../../core/index.js";
import { nodeKey, type SelectionChange } from "../selection/selection-model.js";
import { connectPreview, portAt } from "./connect-candidates.js";
import { distancePx, dragThreshold } from "./thresholds.js";
import type {
  CancelReason,
  ConnectionEvaluation,
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
      /** Last pointer position, to re-read the target when a verdict arrives. */
      readonly at: Point<"world">;
      /** The pair a verdict was last requested for, so a drag asks once per pair. */
      readonly asked: string | undefined;
    }
  /**
   * Released on a target whose verdict is pending: no pointer is down, nothing is
   * committed, and the preview stays at the release point until the verdict arrives or
   * the wait is cancelled.
   */
  | {
      readonly kind: "awaiting";
      readonly source: Endpoint;
      readonly target: Endpoint;
      /** Where the pointer was released, for a choice the verdict may lead to. */
      readonly at: Point<"world">;
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
  return state === undefined ||
    state === "compatible" ||
    state === "choice" ||
    state === "pending"
    ? "crosshair"
    : "not-allowed";
}

const pairKey = (source: Endpoint, target: Endpoint): string =>
  `${source.port}>${target.port}`;

function follow(
  source: Endpoint,
  pointerId: number,
  at: Point<"world">,
  asked: string | undefined,
  ctx: ToolContext,
): Transition<ConnectState> {
  const preview = connectPreview(source, at, ctx);
  const target = preview.target;
  const pending =
    target &&
    preview.candidates.find((c) => c.endpoint === target)?.evaluation.state ===
      "pending";
  const key = target && pending ? pairKey(source, target) : undefined;
  const ask: readonly ToolEffect[] =
    target && key !== undefined && key !== asked
      ? [{ type: "request-verdict", source, target }]
      : [];
  return {
    state: {
      kind: "dragging",
      pointerId,
      source,
      at,
      asked: key ?? asked,
    },
    effects: [
      { type: "preview", preview },
      { type: "cursor", cursor: cursorFor(preview) },
      ...ask,
    ],
  };
}

/** The refusal a release over a rejected candidate reports to the host. */
function refusal(
  source: Endpoint,
  target: Endpoint,
  evaluation: ConnectionEvaluation,
): readonly ToolEffect[] {
  const { code, reason } = evaluation;
  return code === undefined
    ? []
    : [
        {
          type: "reject",
          rejection: rejectionOf(code, reason ?? "The connection is refused", [
            source.port,
            target.port,
          ]),
        },
      ];
}

/** What a release, or the verdict a release waited for, does for a settled target. */
function settle(
  source: Endpoint,
  target: Endpoint,
  evaluation: ConnectionEvaluation,
  at: Point<"world">,
  ctx: ToolContext,
): Transition<ConnectState> {
  if (evaluation.state === "choice") {
    if (!ctx.chooserInstalled) return { state: IDLE, effects: END };
    const request = {
      source,
      target,
      alternatives: evaluation.alternatives ?? [],
      at,
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
  if (evaluation.state !== "compatible") {
    return {
      state: IDLE,
      effects: [...END, ...refusal(source, target, evaluation)],
    };
  }
  return {
    state: IDLE,
    effects: [
      ...END,
      {
        type: "commit",
        command: { kind: "connect", from: source, to: target },
      },
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

const POINTER_CANCELS: ReadonlySet<CancelReason> = new Set([
  "pointercancel",
  "lost-capture",
  "blur",
  "hidden",
  "context-menu",
]);

/** The wait of the pending target resolution rule: only a verdict or a cancellation moves it on. */
function awaiting(
  state: Extract<ConnectState, { kind: "awaiting" }>,
  input: ToolInput,
  ctx: ToolContext,
): Transition<ConnectState> {
  if (input.type === "cancel") {
    // No pointer is down while waiting, so pointer-related and focus-related cancellations
    // do not concern it (clicking elsewhere in the page, switching tabs).
    return POINTER_CANCELS.has(input.reason)
      ? { state, effects: [] }
      : { state: IDLE, effects: END };
  }
  if (input.type !== "verdict") return { state, effects: [] };
  const { source, target } = state;
  const evaluation = ctx.evaluateConnection(source, target);
  if (evaluation.state === "pending") return { state, effects: [] };
  return settle(source, target, evaluation, state.at, ctx);
}

export const connectTool: Tool<ConnectState> = {
  id: "connect",
  idle: IDLE,
  accepts: ({ input, hits, spaceHeld }) =>
    input.button === 0 && !spaceHeld && portAt(hits) !== undefined,
  isIdle: (state) => state.kind === "idle",
  autoPans: (state) => state.kind === "dragging",
  awaiting: (state) => state.kind === "awaiting",
  involved(state) {
    if (state.kind === "idle") return [];
    const { source } = state;
    return state.kind === "awaiting"
      ? [source.node, source.port, state.target.node, state.target.port]
      : [source.node, source.port];
  },
  transition(state, input, ctx) {
    if (state.kind === "idle") return idle(input, ctx);
    if (state.kind === "awaiting") return awaiting(state, input, ctx);
    if (input.type === "verdict") {
      // A verdict may also have removed one: a target that is pending again is asked
      // about again, as the request is shared and answered from the cache when known.
      return state.kind === "dragging"
        ? follow(state.source, state.pointerId, state.at, undefined, ctx)
        : { state, effects: [] };
    }
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
        : follow(state.source, state.pointerId, input.world, undefined, ctx);
    }
    if (input.type === "pointer-move") {
      return follow(
        state.source,
        state.pointerId,
        input.world,
        state.asked,
        ctx,
      );
    }
    // Release: the target is decided at the release point, against the live model.
    const preview = connectPreview(state.source, input.world, ctx);
    const { target, candidates } = preview;
    const evaluation = candidates.find(
      (c) => c.endpoint === target,
    )?.evaluation;
    if (!target || !evaluation) {
      // Over a refused port: say why; anywhere else nothing is said.
      const nearest = candidates[0];
      return {
        state: IDLE,
        effects: [
          ...END,
          ...(nearest
            ? refusal(state.source, nearest.endpoint, nearest.evaluation)
            : []),
        ],
      };
    }
    if (evaluation.state === "pending") {
      // The verdict is not known yet: keep the preview where it was released and wait.
      return {
        state: {
          kind: "awaiting",
          source: state.source,
          target,
          at: input.world,
        },
        effects: [
          { type: "preview", preview },
          { type: "cursor", cursor: "default" },
          { type: "release", pointerId: state.pointerId },
          { type: "validate-wait", source: state.source, target },
        ],
      };
    }
    return settle(state.source, target, evaluation, input.world, ctx);
  },
};
