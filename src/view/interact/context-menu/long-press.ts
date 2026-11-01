/**
 * Touch long-press (D5) as a pure state machine. It decides when the caller
 * starts or clears its timer and when the context menu fires; the caller owns the timer,
 * the DOM and the event. Only touch arms. Moving beyond the touch drag threshold, a
 * second touch, release or cancel disarm, so a long-press and a pan-first drag exclude
 * each other. A native `contextmenu` for an armed touch counts as the fire (Chrome on
 * Android sends one), and one after the fire is swallowed: one event per touch.
 */
import type { Point } from "../../../core/index.js";
import { distancePx } from "../tools/thresholds.js";
import type { PointerType } from "../tools/tool-types.js";

export type LongPressState =
  | { readonly kind: "idle" }
  | {
      readonly kind: "armed";
      readonly pointerId: number;
      readonly start: Point<"viewport">;
    }
  /** The menu fired; the rest of this touch is swallowed. */
  | { readonly kind: "fired"; readonly pointerId: number };

export type LongPressInput =
  | {
      readonly type: "down";
      readonly pointerId: number;
      readonly pointerType: PointerType;
      readonly viewport: Point<"viewport">;
      /** A listener exists and `longPressMs` is not `false`. */
      readonly enabled: boolean;
    }
  | {
      readonly type: "move";
      readonly pointerId: number;
      readonly viewport: Point<"viewport">;
    }
  | { readonly type: "up"; readonly pointerId: number }
  /** pointercancel, blur, a hidden document or dispose. */
  | { readonly type: "cancel" }
  | { readonly type: "timeout" }
  | { readonly type: "native-contextmenu"; readonly pointerId?: number };

/**
 * `arm`: start the timer. `disarm`: clear it. `fire`: clear it, cancel the press and
 * raise the event. `swallow`: prevent a native menu without raising an event. `none`:
 * nothing to do (a native `contextmenu` then takes the normal path).
 */
export type LongPressAction = "none" | "arm" | "disarm" | "fire" | "swallow";

export interface LongPressStep {
  readonly state: LongPressState;
  readonly action: LongPressAction;
}

export const LONG_PRESS_IDLE: LongPressState = { kind: "idle" };

const step = (
  state: LongPressState,
  action: LongPressAction = "none",
): LongPressStep => ({ state, action });

/** One transition; `thresholdPx` is the touch drag threshold. */
export function longPressStep(
  state: LongPressState,
  input: LongPressInput,
  thresholdPx: number,
): LongPressStep {
  const disarm = () =>
    step(LONG_PRESS_IDLE, state.kind === "armed" ? "disarm" : "none");
  switch (input.type) {
    case "down":
      // A second touch disarms, so a future pinch never opens a menu.
      if (state.kind !== "idle") return disarm();
      if (input.pointerType !== "touch" || !input.enabled) return step(state);
      return step(
        { kind: "armed", pointerId: input.pointerId, start: input.viewport },
        "arm",
      );
    case "move":
      if (state.kind !== "armed" || input.pointerId !== state.pointerId) {
        return step(state);
      }
      return distancePx(input.viewport, state.start) > thresholdPx
        ? disarm()
        : step(state);
    case "up":
      return state.kind !== "idle" && input.pointerId === state.pointerId
        ? disarm()
        : step(state);
    case "cancel":
      return disarm();
    case "timeout":
      return state.kind === "armed"
        ? step({ kind: "fired", pointerId: state.pointerId }, "fire")
        : step(state);
    case "native-contextmenu":
      if (state.kind === "armed") {
        return step({ kind: "fired", pointerId: state.pointerId }, "fire");
      }
      return state.kind === "fired" ? step(state, "swallow") : step(state);
  }
}
