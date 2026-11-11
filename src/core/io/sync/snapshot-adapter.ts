/**
 * The snapshot adapter: an external adapter for a host that owns the document and
 * re-sends all of it after every change.
 *
 * Local edits show at once and wait in the pending layer for the host's answer (see
 * `submit-flow.ts` and the settle table in `snapshot-settle.ts`); pushed snapshots become
 * the confirmed state and are shown with the pending edits rebased on top
 * (`snapshot-push.ts`). Reads never wait for the host.
 */
import {
  cursorProblem,
  EMPTY_CURSOR,
  type IdCursor,
} from "../../base/ids/id-generator.js";
import { type OperationId, operationId } from "../../base/ids/ids.js";
import { MisuseError, rejectionOf } from "../../base/result.js";
import type { PatchValidator } from "../../data/patch/validator.js";
import { advanceCursor } from "../../edit/adapter/cursor.js";
import {
  checkReplacement,
  replaceStoreContents,
} from "../../edit/adapter/replace-document.js";
import type { CommitNotice, Submission } from "../../edit/adapter/types.js";
import { createEventHub } from "../../edit/events/event-hub.js";
import { globalTimers } from "../../edit/policy/verdict-env.js";
import { checkOptions, numericOrder } from "./adapter-options.js";
import { placeholdersOf } from "./creation-flow.js";
import { delegateTo } from "./creation-handover.js";
import { createHostSyncHistory } from "./host-history.js";
import { createLocalSyncHistory } from "./local-history.js";
import { pushOrQueue } from "./snapshot-push.js";
import { settleAllSilently, settleFromHost } from "./snapshot-settle.js";
import { submitTo } from "./submit-flow.js";
import type { SyncHistory } from "./sync-history.js";
import {
  createStoreView,
  NO_HISTORY_HOOKS,
  type SyncState,
  unconfirmedOf,
} from "./sync-state.js";
import type { SnapshotAdapter, SnapshotAdapterOptions } from "./sync-types.js";

export function createSnapshotAdapter(
  options: SnapshotAdapterOptions,
): SnapshotAdapter {
  checkOptions(options);
  const commitListeners: ((notice: CommitNotice) => void)[] = [];
  const validators: PatchValidator[] = [];
  let operations = 0;
  const freeze = options.freezeRecords ?? true;
  const state: SyncState = {
    displayed: createStoreView(freeze),
    confirmed: createStoreView(freeze),
    freeze,
    hub: createEventHub(
      options.onHandlerError ? { onHandlerError: options.onHandlerError } : {},
    ),
    history: NO_HISTORY_HOOKS,
    entries: [],
    creations: [],
    generator: options.idGenerator,
    cursor: EMPTY_CURSOR,
    codecs: options.codecs,
    pushLimits: options.pushLimits,
    timeoutMs: options.timeoutMs,
    compareRevisions: options.compareRevisions ?? numericOrder,
    lastHostRevision: undefined,
    timers: options.timers ?? globalTimers,
    log: options.onLog ?? (() => {}),
    notifyCommit: (notice) => {
      for (const listener of [...commitListeners]) listener(notice);
    },
    mint: () => operationId(`op${++operations}`),
    unsettled: new Map(),
    disposed: false,
  };
  const { hub } = state;
  const deps = { validators, onSubmit: options.onSubmit };
  const history: SyncHistory =
    options.history === "host"
      ? createHostSyncHistory(state, options)
      : createLocalSyncHistory(state, deps, options.historyLimit);
  state.history = history;
  // Cursor past the queued submissions; dropped when none is left.
  let reserved: IdCursor | undefined;
  let queued = 0;
  const reserve = (sub: Submission) => {
    reserved = advanceCursor(
      state.generator,
      reserved ?? state.cursor,
      sub.patch,
    );
    queued += 1;
    return () => {
      queued -= 1;
      if (queued === 0) reserved = undefined;
    };
  };
  const live = (): void => {
    if (state.disposed) throw new MisuseError("The model has been disposed");
  };

  return {
    authority: "external",
    history: options.history ?? "local",
    nodeCreation: options.nodeCreation ?? "local",
    reader: state.displayed.reader,
    idGenerator: state.generator,
    on: (type, handler) => {
      live();
      return hub.on(type, handler);
    },
    addValidator(validator) {
      live();
      validators.push(validator);
      return () => {
        const at = validators.indexOf(validator);
        if (at >= 0) validators.splice(at, 1);
      };
    },
    validators: () => validators,
    onCommit(listener) {
      live();
      commitListeners.push(listener);
      return () => {
        const at = commitListeners.indexOf(listener);
        if (at >= 0) commitListeners.splice(at, 1);
      };
    },
    idCursor: () => state.cursor,
    planningCursor: () => reserved ?? state.cursor,
    revision: () => state.displayed.reader.revision(),
    mintOperationId: state.mint,
    replaceDocument(replacement) {
      live();
      if (hub.isDispatching())
        throw new MisuseError(
          "replaceDocument cannot run inside an event handler; defer it (for example with queueMicrotask)",
        );
      if (
        typeof replacement !== "object" ||
        replacement === null ||
        cursorProblem(replacement.idCursor) !== undefined
      )
        throw new MisuseError(
          "replaceDocument expects records and an ID cursor",
        );
      const checked = checkReplacement(replacement);
      // The new document is the truth: no rollback and no failure events.
      settleAllSilently(
        state,
        rejectionOf(
          "document-replaced",
          "The document was replaced before the host answered this edit",
        ),
      );
      replaceStoreContents(state.displayed.store, checked);
      state.confirmed = createStoreView(state.freeze);
      replaceStoreContents(state.confirmed.store, checked);
      state.cursor = replacement.idCursor;
      // Another document: its host revisions start afresh.
      state.lastHostRevision = undefined;
      history.clear();
      state.notifyCommit({ kind: "reset" });
      const now = state.displayed.reader.revision();
      hub.emitReset({ revision: now, origin: replacement.origin ?? "local" });
      history.announce();
      return now;
    },
    reportRejection(id: OperationId, rejection) {
      live();
      hub.emit("failure", {
        source: "rejection",
        operationId: id,
        origin: "local",
        rejection,
      });
    },
    submit(sub) {
      live();
      if (
        typeof sub !== "object" ||
        sub === null ||
        !Array.isArray(sub.patch?.ops)
      )
        throw new MisuseError("submit expects a submission with a patch");
      return submitTo(state, deps, sub, reserve);
    },
    delegate(intent) {
      live();
      if (options.nodeCreation !== "delegated")
        throw new MisuseError(
          "This adapter names nodes itself; it has nothing to delegate",
        );
      return delegateTo(state, options.onDelegate, intent);
    },
    undo: () => {
      live();
      return history.undo();
    },
    redo: () => {
      live();
      return history.redo();
    },
    historyState: () => {
      live();
      return history.state();
    },
    pushSnapshot(snapshot, revision) {
      live();
      return pushOrQueue(state, snapshot, revision);
    },
    confirmedReader: () => state.confirmed.reader,
    unconfirmed: () => unconfirmedOf(state.entries),
    placeholders: () => placeholdersOf(state),
    pendingEdits: () =>
      state.entries.map((e) => ({
        operationId: e.operationId,
        state: e.state,
        label: e.submission.label,
        patch: e.patch,
        ...(e.reason === undefined ? {} : { reason: e.reason }),
      })),
    settle(id, answer) {
      live();
      return settleFromHost(state, id, answer);
    },
    dispose() {
      if (state.disposed) return;
      state.disposed = true;
      hub.clear();
      for (const entry of state.entries)
        if (entry.timer !== undefined) state.timers.clearTimeout(entry.timer);
      state.entries.length = 0;
      for (const entry of state.creations)
        if (entry.timer !== undefined) state.timers.clearTimeout(entry.timer);
      state.creations.length = 0;
      const rejection = rejectionOf(
        "disposed",
        "The model was disposed before the host answered",
      );
      for (const [resolve, id] of [...state.unsettled])
        resolve({ ok: false, status: "rejected", operationId: id, rejection });
      validators.length = 0;
      commitListeners.length = 0;
      history.clear();
    },
  };
}
