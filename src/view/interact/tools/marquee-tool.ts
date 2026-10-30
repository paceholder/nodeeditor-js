/**
 * Marquee tool (D5): rubber-band selection from an empty-canvas press
 * (with `emptyDrag: "pan"`, only a Shift or primary-modifier press).
 * Left-to-right selects entities fully inside (solid outline); right-to-left selects
 * anything the rectangle touches (dashed outline). Shift adds, the primary modifier
 * toggles, and a click without drag clears the selection.
 */
import { type Point, rectFromPoints } from "../../../core/index.js";
import type { SelectionChange } from "../selection/selection-model.js";
import { marqueeKeys } from "./marquee-select.js";
import { distancePx, dragThreshold } from "./thresholds.js";
import type {
  Modifiers,
  PointerType,
  Tool,
  ToolContext,
  ToolEffect,
  ToolPreview,
  Transition,
} from "./tool-types.js";

export type MarqueeState =
  | { readonly kind: "idle" }
  | {
      readonly kind: "pressed";
      readonly pointerId: number;
      readonly pointerType: PointerType | undefined;
      readonly startViewport: Point<"viewport">;
      readonly startWorld: Point<"world">;
      readonly modifiers: Modifiers;
      readonly dragging: boolean;
      readonly mode: "contain" | "intersect";
      readonly current: Point<"world">;
    };

const IDLE: MarqueeState = { kind: "idle" };
const CLEAR_PREVIEW: ToolEffect = { type: "preview", preview: null };

function modeFor(
  start: Point<"world">,
  current: Point<"world">,
  ctx: ToolContext,
): "contain" | "intersect" {
  const { marquee } = ctx.options;
  if (marquee !== "direction") return marquee;
  return current.x < start.x ? "intersect" : "contain";
}

function previewOf(
  state: Extract<MarqueeState, { kind: "pressed" }>,
): ToolPreview {
  return {
    kind: "marquee",
    rect: rectFromPoints(state.startWorld, state.current),
    mode: state.mode,
  };
}

function finish(
  state: Extract<MarqueeState, { kind: "pressed" }>,
  ctx: ToolContext,
): Transition<MarqueeState> {
  const { shift, mod } = state.modifiers;
  if (!state.dragging) {
    // A click on empty canvas clears, unless a modifier asks to keep the selection.
    const effects: ToolEffect[] =
      shift || mod ? [] : [{ type: "select", change: { mode: "clear" } }];
    return { state: IDLE, effects };
  }
  const keys = marqueeKeys(
    rectFromPoints(state.startWorld, state.current),
    state.mode,
    ctx,
  );
  const change: SelectionChange = mod
    ? { mode: "toggle", keys }
    : { mode: shift ? "add" : "replace", keys };
  return {
    state: IDLE,
    effects: [CLEAR_PREVIEW, { type: "select", change }],
  };
}

export const marqueeTool: Tool<MarqueeState> = {
  id: "marquee",
  idle: IDLE,
  // With `emptyDrag: "pan"` a plain drag pans, so the marquee needs Shift or Mod.
  accepts: ({ input, spaceHeld }, ctx) =>
    input.button === 0 &&
    !spaceHeld &&
    (ctx.options.emptyDrag === "marquee" ||
      input.modifiers.shift ||
      input.modifiers.mod),
  isIdle: (state) => state.kind === "idle",
  transition(state, input, ctx) {
    switch (state.kind) {
      case "idle":
        if (input.type !== "pointer-down") return { state, effects: [] };
        return {
          state: {
            kind: "pressed",
            pointerId: input.pointerId,
            pointerType: input.pointerType,
            startViewport: input.viewport,
            startWorld: input.world,
            modifiers: input.modifiers,
            dragging: false,
            mode: modeFor(input.world, input.world, ctx),
            current: input.world,
          },
          effects: [],
        };
      case "pressed":
        if (
          input.type === "pointer-move" &&
          input.pointerId === state.pointerId
        ) {
          const far =
            distancePx(input.viewport, state.startViewport) >
            dragThreshold(ctx.options, state.pointerType);
          if (!state.dragging && !far) return { state, effects: [] };
          const next = {
            ...state,
            dragging: true,
            current: input.world,
            mode: modeFor(state.startWorld, input.world, ctx),
          };
          return {
            state: next,
            effects: [{ type: "preview", preview: previewOf(next) }],
          };
        }
        if (
          input.type === "pointer-up" &&
          input.pointerId === state.pointerId
        ) {
          return finish(state, ctx);
        }
        if (input.type === "cancel") {
          return { state: IDLE, effects: [CLEAR_PREVIEW] };
        }
        return { state, effects: [] };
    }
  },
};
