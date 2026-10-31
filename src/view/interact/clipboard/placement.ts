/**
 * Paste placement (EDT-03, D7). The view decides the `Placement`; core only applies it.
 *
 * - Pointer over the view: the fragment's bounding-box centre goes to the pointer.
 * - Otherwise: the original position plus `n` steps, where `n` counts pastes of this
 *   fragment since it was copied (the first paste is `n = 1`).
 * - A paste of the same fragment at exactly the point of the previous one adds
 *   `(n - 1)` steps, so repeated pastes without moving the mouse cascade instead of
 *   stacking.
 * - Duplicate: one step.
 *
 * A new copy, or a paste of a different fragment, starts the count again. Pure functions:
 * the clipboard service keeps the state.
 */
import type { Placement, Vec2 } from "../../../core/index.js";

export interface PlacementState {
  /** The text of the fragment last pasted or copied; identifies "the same fragment". */
  readonly fragment: string | undefined;
  /** Pastes of `fragment` since it was copied. */
  readonly pastes: number;
  /** World point of the previous paste when it was placed at the pointer. */
  readonly lastPoint: Vec2 | undefined;
}

export const INITIAL_PLACEMENT: PlacementState = {
  fragment: undefined,
  pastes: 0,
  lastPoint: undefined,
};

export const DEFAULT_PASTE_STEP: Vec2 = { x: 20, y: 20 };

/** The state right after copying `fragment`: the count starts again. */
export function copiedPlacement(fragment: string): PlacementState {
  return { fragment, pastes: 0, lastPoint: undefined };
}

const scale = (step: Vec2, n: number): Vec2 => ({
  x: step.x * n,
  y: step.y * n,
});

/** Where the next paste of `fragment` goes, and the state after it. */
export function pastePlacement(
  state: PlacementState,
  fragment: string,
  pointer: Vec2 | undefined,
  step: Vec2 = DEFAULT_PASTE_STEP,
): { readonly placement: Placement; readonly next: PlacementState } {
  const same = state.fragment === fragment;
  const n = (same ? state.pastes : 0) + 1;
  if (!pointer) {
    return {
      placement: { kind: "offset", by: scale(step, n) },
      next: { fragment, pastes: n, lastPoint: undefined },
    };
  }
  const again =
    same &&
    state.lastPoint !== undefined &&
    state.lastPoint.x === pointer.x &&
    state.lastPoint.y === pointer.y;
  const extra = again ? scale(step, n - 1) : { x: 0, y: 0 };
  return {
    placement: {
      kind: "center",
      at: { x: pointer.x + extra.x, y: pointer.y + extra.y },
    },
    next: { fragment, pastes: n, lastPoint: { x: pointer.x, y: pointer.y } },
  };
}

export function duplicatePlacement(step: Vec2 = DEFAULT_PASTE_STEP): Placement {
  return { kind: "offset", by: step };
}
