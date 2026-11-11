/**
 * Local history for the snapshot adapter.
 *
 * The stack holds the user's recorded edits in commit order (pushes never enter it). An
 * entry is pushed when its edit is committed to the display and taken out again when the
 * host rejects the edit or it becomes conflicted, so the stack never holds an edit the
 * host refused. Answers may arrive in any order; the stack keeps commit order.
 *
 * Undo is refused with `edit-pending` while the entry it would revert still waits for the
 * host (pending or unknown), and undo and redo both while an earlier undo or redo does:
 * reverting underneath an unanswered edit would reorder the user's work. Undo of a
 * confirmed entry submits its inverse like any other edit; when the host rejects that
 * undo, the entry goes back where it was.
 */
import type { OperationId } from "../../base/ids/ids.js";
import { invertPatch } from "../../data/patch/invert.js";
import type { HistoryState, SubmitResult } from "../../edit/adapter/types.js";
import {
  createLocalHistory,
  type HistoryEntry,
} from "../../edit/history/local-history.js";
import {
  refuse,
  runSubmission,
  type SubmitDeps,
  settlement,
} from "./submit-flow.js";
import {
  emptyStep,
  historyAnnouncer,
  type SyncHistory,
  stepOrQueue,
  unavailable,
} from "./sync-history.js";
import type { SyncState } from "./sync-state.js";

interface Step {
  readonly kind: "undo" | "redo";
  readonly entry: HistoryEntry;
}

const WAITING_EDIT = "Waiting for the host to answer the last edit";
const WAITING_STEP = "Waiting for the host to answer the last undo or redo";

export function createLocalSyncHistory(
  state: SyncState,
  deps: SubmitDeps,
  limit: number | undefined,
): SyncHistory {
  const history = createLocalHistory(limit === undefined ? {} : { limit });
  /** Recorded edits the host has not accepted yet, by operation. */
  const recorded = new Map<OperationId, HistoryEntry>();
  const unanswered = new Set<HistoryEntry>();
  /** Undo and redo submissions the host has not answered yet. */
  const steps = new Map<OperationId, Step>();

  const blocked = (kind: "undo" | "redo"): string | undefined => {
    if (steps.size > 0) return WAITING_STEP;
    const top = kind === "undo" ? history.peekUndo() : undefined;
    return top && unanswered.has(top) ? WAITING_EDIT : undefined;
  };

  function current(): HistoryState {
    let out = history.state();
    const undo = out.canUndo ? blocked("undo") : undefined;
    if (undo) {
      const { undoLabel: _label, ...rest } = out;
      out = {
        ...rest,
        canUndo: false,
        undoReason: undo,
        undoCode: "edit-pending",
      };
    }
    const redo = out.canRedo ? blocked("redo") : undefined;
    if (redo) {
      const { redoLabel: _label, ...rest } = out;
      out = {
        ...rest,
        canRedo: false,
        redoReason: redo,
        redoCode: "edit-pending",
      };
    }
    return out;
  }

  const announce = historyAnnouncer(state, current);

  function step(kind: "undo" | "redo", operationId: OperationId): SubmitResult {
    const now = current();
    if (!(kind === "undo" ? now.canUndo : now.canRedo))
      return refuse(
        state,
        emptyStep(state, kind, operationId),
        unavailable(now, kind),
      );
    const entry = (
      kind === "undo" ? history.peekUndo() : history.peekRedo()
    ) as HistoryEntry;
    const what = kind === "undo" ? "Undo" : "Redo";
    steps.set(operationId, { kind, entry });
    const { settled, resolve } = settlement(state, operationId);
    const done = runSubmission(
      state,
      deps,
      {
        operationId,
        baseRevision: state.displayed.reader.revision(),
        patch: kind === "undo" ? entry.inverse : entry.patch,
        label: `${what} ${entry.label}`,
        history: "skip",
        origin: kind,
      },
      resolve,
    );
    if (!done) return { status: "pending", operationId, settled };
    steps.delete(operationId);
    // The entry can never apply now, nor can the ones recorded under it.
    if (!done.ok)
      history.drop(
        kind,
        `${what} is no longer possible: ${done.rejection.message}`,
      );
    announce();
    resolve(done);
    return done;
  }

  return {
    committed(sub, patch) {
      if (sub.origin === "local" && sub.history === "record") {
        const entry = { label: sub.label, patch, inverse: invertPatch(patch) };
        history.record(entry);
        recorded.set(sub.operationId, entry);
        unanswered.add(entry);
        return;
      }
      const running = steps.get(sub.operationId);
      if (running?.kind === "undo") history.completeUndo();
      else if (running?.kind === "redo") history.completeRedo();
    },
    settled(operationId, fate) {
      if (fate === "unknown") return;
      const entry = recorded.get(operationId);
      if (entry) {
        recorded.delete(operationId);
        unanswered.delete(entry);
        if (fate !== "accepted") history.remove(entry);
        return;
      }
      const running = steps.get(operationId);
      if (!running) return;
      steps.delete(operationId);
      if (fate === "conflicted") history.remove(running.entry);
      else if (fate === "rejected") {
        // The rollback shows the entry's effect again (undo) or hides it again (redo).
        if (running.kind === "undo" && history.peekRedo() === running.entry)
          history.completeRedo();
        else if (
          running.kind === "redo" &&
          history.peekUndo() === running.entry
        )
          history.completeUndo();
      }
    },
    announce,
    undo: () => stepOrQueue(state, "undo", step),
    redo: () => stepOrQueue(state, "redo", step),
    state: current,
    clear() {
      history.clear();
      recorded.clear();
      unanswered.clear();
      steps.clear();
    },
  };
}
