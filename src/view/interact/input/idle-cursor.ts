/**
 * Cursor of a resting pointer, at most once per frame. With no gesture running every mouse
 * move needs a scene pick and the resize-handle hit test to choose the cursor; a burst of
 * moves between two frames needs only the last one, so the work waits for the next frame
 * of the view's clock.
 */
import type { FrameClock } from "../../platform/frame-scheduler.js";
import type { CursorKind } from "../tools/tool-types.js";

export interface IdleCursorDeps {
  readonly clock: FrameClock;
  /** The cursor at a client position; undefined while it cannot be measured. */
  readonly cursorAt: (
    clientX: number,
    clientY: number,
  ) => CursorKind | undefined;
  readonly setCursor: (cursor: CursorKind) => void;
}

export interface IdleCursor {
  /** The pointer rests at a new client position. */
  move(clientX: number, clientY: number): void;
  /** Drop the pending update (a gesture started, the pointer left). */
  cancel(): void;
  dispose(): void;
}

export function createIdleCursor(deps: IdleCursorDeps): IdleCursor {
  let at: { x: number; y: number } | undefined;
  let handle: number | undefined;
  let disposed = false;
  const run = (): void => {
    handle = undefined;
    const p = at;
    at = undefined;
    if (disposed || !p) return;
    const cursor = deps.cursorAt(p.x, p.y);
    if (cursor) deps.setCursor(cursor);
  };
  const cancel = (): void => {
    if (handle !== undefined) deps.clock.cancel(handle);
    handle = undefined;
    at = undefined;
  };
  return {
    move(clientX, clientY) {
      if (disposed) return;
      at = { x: clientX, y: clientY };
      handle ??= deps.clock.request(run);
    },
    cancel,
    dispose() {
      cancel();
      disposed = true;
    },
  };
}
