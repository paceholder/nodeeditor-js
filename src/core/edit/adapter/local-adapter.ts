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
  cursorProblem,
  EMPTY_CURSOR,
  type IdCursor,
  type IdGenerator,
} from "../../base/ids/id-generator.js";
import { type OperationId, operationId } from "../../base/ids/ids.js";
import { MisuseError, type Rejection, rejectionOf } from "../../base/result.js";
import type { Revision } from "../../base/revision.js";
import { createGraphReader } from "../../data/model/reader.js";
import { createGraphStore, type StoreOptions } from "../../data/model/store.js";
import { applyPatch } from "../../data/patch/apply.js";
import { invertPatch } from "../../data/patch/invert.js";
import type { AppliedPatch } from "../../data/patch/types.js";
import type { PatchValidator } from "../../data/patch/validator.js";
import { createEventHub } from "../events/event-hub.js";
import { createLocalHistory } from "../history/local-history.js";
import { advanceCursor } from "./cursor.js";
import { checkReplacement, replaceStoreContents } from "./replace-document.js";
import type {
  Accepted,
  CommitNotice,
  HistoryState,
  ModelAdapter,
  Rejected,
  Submission,
  SubmitResult,
} from "./types.js";

export interface LocalAdapterOptions extends StoreOptions {
  readonly idGenerator?: IdGenerator;
  /** Most undo entries kept (a positive integer); the oldest go first. Default: no limit. */
  readonly historyLimit?: number;
  /** Receives errors thrown by `failure` handlers. */
  readonly onHandlerError?: (error: unknown) => void;
}

/**
 * The local adapter: a `ModelAdapter` that names nodes itself. The name stays as the
 * concrete return type of `createLocalAdapter`.
 */
export interface LocalAdapter extends ModelAdapter {
  readonly authority: "local";
  readonly history: "local";
  readonly nodeCreation: "local";
}

export type { CommitNotice };

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
  const revision = (): Revision => store.revision();
  const mint = (): OperationId => operationId(`op${++operations}`);

  function reject(sub: Submission, rejection: Rejection): Rejected {
    hub.emit("failure", {
      source: "rejection",
      operationId: sub.operationId,
      origin: sub.origin,
      rejection,
    });
    return {
      ok: false,
      status: "rejected",
      operationId: sub.operationId,
      rejection,
    };
  }

  function run(sub: Submission, after: AfterCommit): Accepted | Rejected {
    const result = applyPatch(store, reader, sub.patch, validators, {
      origin: sub.origin,
      operationId: sub.operationId,
    });
    if (!result.ok) return reject(sub, result.rejection);
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
      revision: applied.revision,
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
      rejection: rejectionOf(
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
        `${what} is no longer possible: ${result.rejection.message}`,
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
    nodeCreation: "local",
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
      if (hub.isDispatching()) {
        throw new MisuseError(
          "replaceDocument cannot run inside an event handler; defer it (for example with queueMicrotask)",
        );
      }
      if (
        typeof replacement !== "object" ||
        replacement === null ||
        cursorProblem(replacement.idCursor) !== undefined
      ) {
        throw new MisuseError(
          "replaceDocument expects records and an ID cursor",
        );
      }
      replaceStoreContents(store, checkReplacement(replacement));
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
      // Checked now, also for a queued edit: the ones queued before it advance the
      // revision on purpose.
      const now = revision();
      if (sub.baseRevision !== now) {
        return reject(
          sub,
          rejectionOf(
            "stale-revision",
            `The edit was planned against revision ${String(sub.baseRevision)}, but the model is at revision ${now}`,
          ),
        );
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
    delegate() {
      live();
      throw new MisuseError(
        "The local adapter names nodes itself; it has nothing to delegate",
      );
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
