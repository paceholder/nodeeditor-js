/**
 * Local adapter: synchronous authority over the in-memory store.
 *
 * `submit` validates and commits the patch before returning, so the read model already
 * reflects an accepted edit when the call returns. The adapter owns local undo/redo and
 * the event hub. A submission made while events are being dispatched (from inside a
 * handler) is queued and applied after the current dispatch, returning a `queued`
 * `Deferred` whose `settled` promise carries the real outcome.
 */

import {
  createCounterIdGenerator,
  EMPTY_CURSOR,
  type IdCursor,
  type IdGenerator,
} from "../../base/ids/id-generator.js";
import { MisuseError, type Rejection, rejectionOf } from "../../base/result.js";
import {
  createGraphReader,
  type GraphReader,
} from "../../data/model/reader.js";
import { createGraphStore, type StoreOptions } from "../../data/model/store.js";
import { applyPatch } from "../../data/patch/apply.js";
import { invertPatch } from "../../data/patch/invert.js";
import type { AppliedPatch } from "../../data/patch/types.js";
import type { PatchValidator } from "../../data/patch/validator.js";
import type { EventHub } from "../events/event-hub.js";
import { createEventHub } from "../events/event-hub.js";
import { createLocalHistory } from "../history/local-history.js";
import { advanceCursor } from "./cursor.js";
import {
  type DocumentReplacement,
  replaceStoreContents,
} from "./replace-document.js";
import {
  type Accepted,
  type HistoryState,
  type ModelAdapter,
  type OperationId,
  type Rejected,
  type Revision,
  type Submission,
  type SubmitResult,
  toOperationId,
  toRevision,
} from "./types.js";

export interface LocalAdapterOptions extends StoreOptions {
  readonly idGenerator?: IdGenerator;
  /** Most undo entries kept (a positive integer); the oldest go first. Default: no limit. */
  readonly historyLimit?: number;
  /** Receives errors thrown by `failure` handlers. */
  readonly onHandlerError?: (error: unknown) => void;
}

export interface LocalAdapter extends ModelAdapter {
  readonly reader: GraphReader;
  readonly idGenerator: IdGenerator;
  on: EventHub["on"];
  /** Register a validator; returns a function that removes it. */
  addValidator(validator: PatchValidator): () => void;
  /**
   * Listen to every commit synchronously, right after the store changed and before any
   * event is delivered or queued edit applied. For caches that must never be stale; a
   * listener must not submit. Returns a function that removes it.
   */
  onCommit(listener: (notice: CommitNotice) => void): () => void;
  /** The registered validators in registration order, as commits run them. */
  validators(): readonly PatchValidator[];
  /** Current ID cursor; only ever moves forward. */
  idCursor(): IdCursor;
  /**
   * The cursor planners should allocate from: the committed cursor, advanced past every
   * submission still queued, so commands issued from one handler do not collide.
   */
  planningCursor(): IdCursor;
  revision(): Revision;
  mintOperationId(): OperationId;
  /**
   * Replace the whole document atomically, set the ID cursor, clear local history and
   * emit one `reset` event. Callers pass already-validated records;
   * `loadSnapshot` is the public entry point.
   */
  replaceDocument(replacement: DocumentReplacement): Revision;
  /** Publish a `failure` event for an edit refused before it reached `submit`. */
  reportRejection(operationId: OperationId, rejection: Rejection): void;
}

/** What a commit listener hears: an applied patch, or a whole-document replacement. */
export type CommitNotice =
  | {
      readonly kind: "change";
      readonly patch: AppliedPatch["patch"];
      readonly origin: Submission["origin"];
    }
  | { readonly kind: "reset" };

/** What to do with the history once an applied submission has been committed. */
type AfterCommit = (applied: AppliedPatch) => boolean;

export function createLocalAdapter(
  options: LocalAdapterOptions = {},
): LocalAdapter {
  const store = createGraphStore(
    options.freezeRecords === undefined
      ? {}
      : { freezeRecords: options.freezeRecords },
  );
  const reader = createGraphReader(store);
  const generator = options.idGenerator ?? createCounterIdGenerator();
  const hub = createEventHub(
    options.onHandlerError ? { onHandlerError: options.onHandlerError } : {},
  );
  const history = createLocalHistory(
    options.historyLimit === undefined ? {} : { limit: options.historyLimit },
  );
  const validators: PatchValidator[] = [];
  const commitListeners: ((notice: CommitNotice) => void)[] = [];
  const notifyCommit = (notice: CommitNotice): void => {
    for (const listener of [...commitListeners]) listener(notice);
  };
  let cursor: IdCursor = EMPTY_CURSOR;
  // Cursor past the queued submissions; dropped when none is left.
  let reserved: IdCursor | undefined;
  let queuedSubmits = 0;
  let operations = 0;
  let disposed = false;

  const live = (): void => {
    if (disposed) throw new MisuseError("The model has been disposed");
  };
  const revision = (): Revision => toRevision(`r${store.revision()}`);
  const mint = (): OperationId => toOperationId(`op${++operations}`);

  function reject(
    sub: Submission,
    error: ReturnType<typeof rejectionOf>,
  ): Rejected {
    hub.emit("failure", {
      source: "rejection",
      operationId: sub.operationId,
      origin: sub.origin,
      rejection: error,
    });
    return {
      ok: false,
      status: "rejected",
      operationId: sub.operationId,
      error,
    };
  }

  function run(sub: Submission, after: AfterCommit): Accepted | Rejected {
    const result = applyPatch(store, reader, sub.patch, validators, {
      origin: sub.origin,
      operationId: sub.operationId,
    });
    if (!result.ok) return reject(sub, result.error);
    const applied = result.value;
    cursor = advanceCursor(generator, cursor, sub.patch);
    if (applied.patch.ops.length > 0)
      notifyCommit({
        kind: "change",
        patch: applied.patch,
        origin: sub.origin,
      });
    const accepted: Accepted = {
      ok: true,
      status: "accepted",
      operationId: sub.operationId,
      revision: toRevision(`r${applied.revision}`),
      changed: applied.changed,
    };
    if (sub.patch.ops.length === 0) return accepted;
    const historyChanged = after(applied);
    hub.dispatch(() => {
      hub.emit("change", {
        revision: accepted.revision,
        patch: applied.patch,
        origin: sub.origin,
        operationId: sub.operationId,
        changed: applied.changed,
      });
      if (historyChanged) hub.emit("history", history.state());
    });
    return accepted;
  }

  const deferred = (
    operationId: OperationId,
    work: () => Accepted | Rejected,
  ): SubmitResult => ({
    status: "queued",
    operationId,
    settled: hub.defer(work, () => ({
      ok: false,
      status: "rejected",
      operationId,
      error: rejectionOf(
        "disposed",
        "The model was disposed before this edit ran",
      ),
    })),
  });

  function recordLocal(sub: Submission): AfterCommit {
    return (applied) => {
      if (sub.history !== "record" || sub.origin !== "local") return false;
      history.record({
        label: sub.label,
        patch: applied.patch,
        inverse: invertPatch(applied.patch),
      });
      return true;
    };
  }

  function step(
    kind: "undo" | "redo",
    operationId: OperationId = mint(),
  ): Accepted | Rejected {
    const entry = kind === "undo" ? history.peekUndo() : history.peekRedo();
    if (!entry) {
      return reject(
        {
          operationId,
          baseRevision: revision(),
          patch: { ops: [] },
          label: kind,
          history: "skip",
          origin: kind,
        },
        rejectionOf("history-unavailable", `Nothing to ${kind}`),
      );
    }
    const result = run(
      {
        operationId,
        baseRevision: revision(),
        patch: kind === "undo" ? entry.inverse : entry.patch,
        label: `${kind === "undo" ? "Undo" : "Redo"} ${entry.label}`,
        history: "skip",
        origin: kind,
      },
      () => {
        if (kind === "undo") history.completeUndo();
        else history.completeRedo();
        return true;
      },
    );
    if (!result.ok) {
      // The entry can never apply now, nor can the ones recorded under it.
      const what = kind === "undo" ? "Undo" : "Redo";
      history.drop(
        kind,
        `${what} is no longer possible: ${result.error.message}`,
      );
      hub.emit("history", history.state());
    }
    return result;
  }

  const stepOrQueue = (kind: "undo" | "redo"): SubmitResult => {
    live();
    if (!hub.isDispatching()) return step(kind);
    const operationId = mint();
    return deferred(operationId, () => step(kind, operationId));
  };

  return {
    authority: "local",
    history: "local",
    reader,
    idGenerator: generator,
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
    idCursor: () => cursor,
    planningCursor: () => reserved ?? cursor,
    revision,
    mintOperationId: mint,
    replaceDocument(replacement) {
      live();
      replaceStoreContents(store, replacement);
      cursor = replacement.idCursor;
      notifyCommit({ kind: "reset" });
      const hadHistory = history.state().canUndo || history.state().canRedo;
      history.clear();
      const now = revision();
      hub.emitReset({ revision: now, origin: replacement.origin ?? "local" });
      if (hadHistory) hub.emit("history", history.state());
      return now;
    },
    reportRejection(operationId, rejection) {
      live();
      hub.emit("failure", {
        source: "rejection",
        operationId,
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
      ) {
        throw new MisuseError("submit expects a submission with a patch");
      }
      if (!hub.isDispatching()) return run(sub, recordLocal(sub));
      // Reserve the queued patch's IDs now, so the next plan continues after them.
      reserved = advanceCursor(generator, reserved ?? cursor, sub.patch);
      queuedSubmits += 1;
      return deferred(sub.operationId, () => {
        try {
          return run(sub, recordLocal(sub));
        } finally {
          queuedSubmits -= 1;
          if (queuedSubmits === 0) reserved = undefined;
        }
      });
    },
    undo: () => stepOrQueue("undo"),
    redo: () => stepOrQueue("redo"),
    historyState(): HistoryState {
      live();
      return history.state();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      hub.clear();
      history.clear();
      validators.length = 0;
      commitListeners.length = 0;
    },
  };
}
