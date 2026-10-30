/**
 * Empty-canvas pan: with `emptyDrag: "pan"`, a plain primary-button drag that
 * no port, node or connection claimed scrolls the view. It waits for the drag threshold,
 * so a click there still clears the selection as it does in marquee mode. Shift or the
 * primary modifier leaves the press to the marquee.
 */
import type { Point } from "../../../core/index.js";
import { distancePx, dragThreshold } from "./thresholds.js";
import type { PointerType, Tool, ToolEffect } from "./tool-types.js";

export type EmptyPanState =
  | { readonly kind: "idle" }
  | {
      /** Below the drag threshold; release clears the selection. */
      readonly kind: "pressed";
      readonly pointerId: number;
      readonly pointerType: PointerType | undefined;
      readonly start: Point<"viewport">;
    }
  | {
      readonly kind: "panning";
      readonly pointerId: number;
      readonly last: Point<"viewport">;
    };

const IDLE: EmptyPanState = { kind: "idle" };

function panBy(from: Point<"viewport">, to: Point<"viewport">): ToolEffect {
  return {
    type: "viewport",
    op: { kind: "panBy", dx: to.x - from.x, dy: to.y - from.y },
  };
}

export const emptyPanTool: Tool<EmptyPanState> = {
  id: "empty-pan",
  idle: IDLE,
  accepts: ({ input, spaceHeld }, ctx) =>
    ctx.options.emptyDrag === "pan" &&
    input.button === 0 &&
    !spaceHeld &&
    !input.modifiers.shift &&
    !input.modifiers.mod,
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
            start: input.viewport,
          },
          effects: [],
        };
      case "pressed":
        if (input.type === "cancel") return { state: IDLE, effects: [] };
        if (!("pointerId" in input) || input.pointerId !== state.pointerId) {
          return { state, effects: [] };
        }
        if (input.type === "pointer-up") {
          return {
            state: IDLE,
            effects: [{ type: "select", change: { mode: "clear" } }],
          };
        }
        if (
          input.type !== "pointer-move" ||
          distancePx(input.viewport, state.start) <=
            dragThreshold(ctx.options, state.pointerType)
        ) {
          return { state, effects: [] };
        }
        return {
          state: {
            kind: "panning",
            pointerId: state.pointerId,
            last: input.viewport,
          },
          effects: [
            { type: "cursor", cursor: "grabbing" },
            panBy(state.start, input.viewport),
          ],
        };
      case "panning":
        if (input.type === "cancel") {
          // Cancelling keeps the pan already applied: the viewport is view state.
          return {
            state: IDLE,
            effects: [{ type: "cursor", cursor: "default" }],
          };
        }
        if (!("pointerId" in input) || input.pointerId !== state.pointerId) {
          return { state, effects: [] };
        }
        if (input.type === "pointer-up") {
          return {
            state: IDLE,
            effects: [{ type: "cursor", cursor: "default" }],
          };
        }
        if (input.type !== "pointer-move") return { state, effects: [] };
        return {
          state: { ...state, last: input.viewport },
          effects: [panBy(state.last, input.viewport)],
        };
    }
  },
};
