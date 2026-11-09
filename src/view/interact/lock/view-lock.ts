/**
 * View lock: a view-local narrowing of what the user may do. While locked,
 * editing gestures and commands report this refusal; pan, zoom, fit, selection, inspection
 * and hover keep working. It never relaxes adapter permissions, never reaches history and
 * is never serialized.
 */
import {
  type Availability,
  type Rejection,
  rejectionOf,
} from "../../../core/index.js";

export const VIEW_LOCKED: Rejection = rejectionOf(
  "capability-denied",
  "The view is locked",
);

export const LOCKED: Availability = {
  available: false,
  rejection: VIEW_LOCKED,
};

export interface ViewLock {
  get(): boolean;
  /** Returns whether the state changed. */
  set(locked: boolean): boolean;
}

export function createViewLock(initial = false): ViewLock {
  let locked = initial;
  return {
    get: () => locked,
    set(next) {
      if (next === locked) return false;
      locked = next;
      return true;
    },
  };
}
