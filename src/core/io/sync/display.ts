/**
 * Changes to the displayed read model that do not come from a local edit: the patch of a
 * push and the recomputation after a rejection. Both are applied without validators (the
 * host is the authority) as one committed change of origin `external`, which never enters
 * local history.
 */

import { applyPatch } from "../../data/patch/apply.js";
import type { Patch } from "../../data/patch/types.js";
import { advanceCursor } from "../../edit/adapter/cursor.js";
import { displayPatch } from "./display-diff.js";
import { rebase } from "./rebase.js";
import { involvedIn, type PendingEntry, type SyncState } from "./sync-state.js";

/** Apply `patch` to the displayed store and announce it. Returns the operation count. */
export function applyExternal(state: SyncState, patch: Patch): number {
  state.cursor = advanceCursor(state.generator, state.cursor, patch);
  if (patch.ops.length === 0) return 0;
  const { store, reader } = state.displayed;
  const operationId = state.mint();
  const result = applyPatch(store, reader, patch, [], {
    origin: "external",
    operationId,
  });
  if (!result.ok) {
    // The patch was diffed from this very store, so it always applies.
    throw new Error(
      `Internal error: an external change did not apply: ${result.rejection.message}`,
    );
  }
  const applied = result.value;
  state.notifyCommit({
    kind: "change",
    patch: applied.patch,
    origin: "external",
  });
  state.hub.emit("change", {
    revision: applied.revision,
    patch: applied.patch,
    origin: "external",
    operationId,
    changed: applied.changed,
  });
  return applied.patch.ops.length;
}

/**
 * Mark entries that no longer apply: they leave the display, wait for an answer, and are
 * logged and published once as a `conflict` event. Call it after the display change, so a
 * conflict handler reads the display without the edit.
 */
export function markConflicts(
  state: SyncState,
  conflicts: readonly PendingEntry[],
  reason: string,
): void {
  for (const entry of conflicts) {
    entry.state = "conflicted";
    entry.reason = reason;
    state.history.settled(entry.operationId, "conflicted");
    state.log({
      operationId: entry.operationId,
      message: `Edit ${entry.operationId} is conflicted: ${reason}`,
    });
    state.hub.emit("conflict", {
      operationId: entry.operationId,
      reason,
      entities: involvedIn(entry),
    });
  }
}

/**
 * Recompute the display from confirmed state plus the remaining pending entries, after
 * one of them left. Edits that no longer apply are marked conflicted. When a payload
 * codec fails, nothing changes (as for a push) and the failure is returned as text; the
 * caller requests a resynchronization, since the display still shows the edit.
 */
export function redisplay(state: SyncState): string | undefined {
  const { target, conflicts } = rebase(state.confirmed.reader, state.entries);
  const patch = displayPatch(
    state.displayed.reader,
    target.reader,
    state.codecs,
  );
  if (!patch.ok) {
    const why = patch.rejection
      .map((e) => `${e.message} at ${e.path}`)
      .join("; ");
    state.log({ message: `The display could not be recomputed: ${why}` });
    return why;
  }
  applyExternal(state, patch.value);
  markConflicts(
    state,
    conflicts,
    "it no longer applies after an earlier edit was rejected",
  );
  return undefined;
}
