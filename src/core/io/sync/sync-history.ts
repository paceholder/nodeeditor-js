/**
 * The history keeper of the snapshot adapter, in either mode (`local-history.ts` and
 * `host-history.ts` implement it), and the helpers both share.
 *
 * It hears the edit flow through `HistoryHooks` and answers undo, redo and the history
 * state. A `history` event is published only when the state actually changed.
 */
import type { OperationId } from "../../base/ids/ids.js";
import { rejectionOf } from "../../base/result.js";
import { valuesEqual } from "../../data/patch/equal.js";
import type {
  HistoryState,
  Submission,
  SubmitResult,
} from "../../edit/adapter/types.js";
import type { HistoryHooks, Settlement, SyncState } from "./sync-state.js";

export interface SyncHistory extends HistoryHooks {
  undo(): SubmitResult;
  redo(): SubmitResult;
  state(): HistoryState;
  /** Forget every entry (the document was replaced, or the adapter disposed). */
  clear(): void;
}

/** One undo or redo, run now; it returns a terminal or a pending result. */
export type HistoryStep = (
  kind: "undo" | "redo",
  operationId: OperationId,
) => SubmitResult;

/** Run a step now, or after the current dispatch when called from inside a handler. */
export function stepOrQueue(
  state: SyncState,
  kind: "undo" | "redo",
  step: HistoryStep,
): SubmitResult {
  const operationId = state.mint();
  if (!state.hub.isDispatching()) return step(kind, operationId);
  const dropped = (): Settlement => ({
    ok: false,
    status: "rejected",
    operationId,
    rejection: rejectionOf(
      "disposed",
      `The model was disposed before this ${kind} ran`,
    ),
  });
  const settled = state.hub
    .defer<Settlement | Promise<Settlement>>(() => {
      const result = step(kind, operationId);
      return "settled" in result ? result.settled : result;
    }, dropped)
    .then((outcome) => outcome);
  return { status: "queued", operationId, settled };
}

/** The empty submission a refused undo or redo reports. */
export function emptyStep(
  state: SyncState,
  kind: "undo" | "redo",
  operationId: OperationId,
): Submission {
  return {
    operationId,
    baseRevision: state.displayed.reader.revision(),
    patch: { ops: [] },
    label: kind,
    history: "skip",
    origin: kind,
  };
}

/** The refusal for an unavailable undo or redo, taken from the history state. */
export function unavailable(history: HistoryState, kind: "undo" | "redo") {
  const undo = kind === "undo";
  return rejectionOf(
    (undo ? history.undoCode : history.redoCode) ?? "history-unavailable",
    (undo ? history.undoReason : history.redoReason) ?? `Nothing to ${kind}`,
  );
}

/** Publishes `history` when `read()` differs from what was published last. */
export function historyAnnouncer(
  state: SyncState,
  read: () => HistoryState,
): () => void {
  let published = read();
  return () => {
    if (state.disposed) return;
    const now = read();
    if (valuesEqual(now, published)) return;
    published = now;
    state.hub.emit("history", now);
  };
}
