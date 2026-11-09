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
  /** Receives errors thrown by `failure` handlers. */
  readonly onHandlerError?: (error: unknown) => void;
}

export interface LocalAdapter extends ModelAdapter {
  readonly reader: GraphReader;
  readonly idGenerator: IdGenerator;
  on: EventHub["on"];
  /** Register a validator; returns a function that removes it. */
  addValidator(validator: PatchValidator): () => void;
  /** The registered validators in registration order, as commits run them. */
  validators(): readonly PatchValidator[];
  /** Current ID cursor; only ever moves forward. */
  idCursor(): IdCursor;
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
  const history = createLocalHistory();
  const validators: PatchValidator[] = [];
  let cursor: IdCursor = EMPTY_CURSOR;
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

  function step(kind: "undo" | "redo"): Accepted | Rejected {
    const entry = kind === "undo" ? history.peekUndo() : history.peekRedo();
    const operationId = mint();
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
    return run(
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
  }

  const stepOrQueue = (kind: "undo" | "redo"): SubmitResult => {
    live();
    return hub.isDispatching()
      ? deferred(mint(), () => step(kind))
      : step(kind);
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
    idCursor: () => cursor,
    revision,
    mintOperationId: mint,
    replaceDocument(replacement) {
      live();
      replaceStoreContents(store, replacement);
      cursor = replacement.idCursor;
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
      return hub.isDispatching()
        ? deferred(sub.operationId, () => run(sub, recordLocal(sub)))
        : run(sub, recordLocal(sub));
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
    },
  };
}
