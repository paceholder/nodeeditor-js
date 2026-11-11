/**
 * Snapshot push: an incremental external change, never a reset.
 *
 * 1. Validate with the shared validator and its size limits and decode payloads; a
 *    problem refuses the push with nothing changed. A push whose host revision is older
 *    than the last applied one is then ignored as stale, again with nothing changed and
 *    no event. The host revision is the host's token and never the library's revision.
 * 2. The snapshot is the candidate confirmed state. Rebase the pending edits on a scratch
 *    copy of it: an edit it already holds is skipped, one that no longer applies becomes a
 *    conflict.
 * 3. Diff the displayed read model against that target. A failing payload codec refuses
 *    the push, again with nothing changed; otherwise the candidate becomes confirmed state,
 *    the conflicts are marked, and the diff is applied as one change of origin `external`.
 *    An empty diff emits nothing. A delegated creation whose named node the snapshot
 *    holds settles accepted.
 *
 * History, selection, viewport and gestures on untouched entities are not affected.
 */
import { rejectionOf } from "../../base/result.js";
import { advanceCursor } from "../../edit/adapter/cursor.js";
import { replaceStoreContents } from "../../edit/adapter/replace-document.js";
import { prepareLoad } from "../snapshot/load.js";
import type { SnapshotError } from "../snapshot/snapshot-types.js";
import { settleArrivals } from "./creation-flow.js";
import { applyExternal, markConflicts } from "./display.js";
import { displayPatch } from "./display-diff.js";
import { rebase } from "./rebase.js";
import {
  createStoreView,
  type PendingEntry,
  type SyncState,
} from "./sync-state.js";
import type { PushOutcome, PushResult } from "./sync-types.js";

const refused = (rejection: readonly SnapshotError[]): PushOutcome => ({
  ok: false,
  status: "refused",
  rejection,
});

function isStale(state: SyncState, revision: unknown): boolean {
  const last = state.lastHostRevision;
  return (
    revision !== undefined &&
    last !== undefined &&
    state.compareRevisions(revision, last.value) < 0
  );
}

/** Run one push now. */
export function pushNow(
  state: SyncState,
  input: unknown,
  revision?: unknown,
): PushOutcome {
  const prepared = prepareLoad({ idGenerator: state.generator }, input, {
    ...(state.pushLimits ? { limits: state.pushLimits } : {}),
    ...(state.codecs ? { codecs: state.codecs } : {}),
  });
  if (!prepared.ok) return refused(prepared.rejection);
  if (isStale(state, revision)) {
    state.log({
      message: "A pushed snapshot older than the last applied one was ignored",
    });
    return {
      ok: true,
      status: "ignored",
      reason: "stale",
      revision: state.displayed.reader.revision(),
    };
  }
  const { snapshot, replacement } = prepared.value;
  const candidate = createStoreView(state.freeze);
  replaceStoreContents(candidate.store, replacement);

  const live = state.entries.some((e) => e.state !== "conflicted");
  let conflicts: readonly PendingEntry[] = [];
  let patch: ReturnType<typeof displayPatch>;
  if (!live) {
    patch = displayPatch(state.displayed.reader, snapshot, state.codecs);
  } else {
    const rebased = rebase(candidate.reader, state.entries);
    conflicts = rebased.conflicts;
    patch = displayPatch(
      state.displayed.reader,
      rebased.target.reader,
      state.codecs,
    );
  }
  if (!patch.ok) return refused(patch.rejection);

  state.confirmed = candidate;
  if (revision !== undefined) state.lastHostRevision = { value: revision };
  state.cursor = advanceCursor(state.generator, state.cursor, {
    ops: [],
    idCursor: replacement.idCursor,
  });
  let operations = 0;
  state.hub.dispatch(() => {
    operations = applyExternal(state, patch.value);
    markConflicts(
      state,
      conflicts,
      "it no longer applies to the pushed snapshot",
    );
    settleArrivals(state);
    state.history.announce();
  });
  return {
    ok: true,
    status: "applied",
    revision: state.displayed.reader.revision(),
    operations,
  };
}

/** Push now, or after the current dispatch when called from inside a handler. */
export function pushOrQueue(
  state: SyncState,
  input: unknown,
  revision?: unknown,
): PushResult {
  if (!state.hub.isDispatching()) return pushNow(state, input, revision);
  return {
    status: "queued",
    settled: state.hub.defer(
      () => pushNow(state, input, revision),
      () =>
        refused([
          {
            ...rejectionOf(
              "disposed",
              "The model was disposed before this push ran",
            ),
            path: "",
          },
        ]),
    ),
  };
}
