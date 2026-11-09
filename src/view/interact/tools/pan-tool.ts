/**
 * Pan tool: middle-button drag, or Space plus primary-button drag. Applies
 * viewport deltas only; the model is never touched.
 */

import type { Point } from "../../../core/index.js";
import { deepFreeze } from "../../platform/deep-freeze.js";
import type { Tool } from "./tool-types.js";

export type PanState =
  | { readonly kind: "idle" }
  | {
      readonly kind: "panning";
      readonly pointerId: number;
      readonly last: Point<"viewport">;
    };

const IDLE: PanState = { kind: "idle" };

export const panTool: Tool<PanState> = deepFreeze({
  id: "pan",
  idle: IDLE,
  accepts: ({ input, spaceHeld }) =>
    input.button === 1 || (input.button === 0 && spaceHeld),
  isIdle: (state) => state.kind === "idle",
  transition(state, input) {
    switch (state.kind) {
      case "idle":
        if (input.type !== "pointer-down") return { state, effects: [] };
        return {
          state: {
            kind: "panning",
            pointerId: input.pointerId,
            last: input.viewport,
          },
          effects: [{ type: "cursor", cursor: "grabbing" }],
        };
      case "panning":
        if (
          input.type === "pointer-move" &&
          input.pointerId === state.pointerId
        ) {
          return {
            state: { ...state, last: input.viewport },
            effects: [
              {
                type: "viewport",
                op: {
                  kind: "panBy",
                  dx: input.viewport.x - state.last.x,
                  dy: input.viewport.y - state.last.y,
                },
              },
            ],
          };
        }
        if (
          (input.type === "pointer-up" &&
            input.pointerId === state.pointerId) ||
          input.type === "cancel"
        ) {
          // Cancelling a pan keeps the pan already applied: the viewport is view state.
          return {
            state: IDLE,
            effects: [{ type: "cursor", cursor: "default" }],
          };
        }
        return { state, effects: [] };
    }
  },
});
