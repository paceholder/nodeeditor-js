/**
 * The submit flow of the snapshot adapter.
 *
 * A submission is checked against the displayed revision when it is submitted, applied to
 * the displayed read model at once (validators run as for the local adapter) and then
 * handed to the host's `onSubmit`, after its `change` event. Hand-overs run in commit
 * order and never wait for an earlier answer. The result is deferred: `settled` resolves
 * from the host's answer through the settle table.
 */
import type { OperationId } from "../../base/ids/ids.js";
import { type Rejection, rejectionOf } from "../../base/result.js";
import { applyPatch } from "../../data/patch/apply.js";
import type { PatchValidator } from "../../data/patch/validator.js";
import { advanceCursor } from "../../edit/adapter/cursor.js";
import type {
  Accepted,
  Rejected,
  Submission,
  SubmitResult,
} from "../../edit/adapter/types.js";
import { readAnswer } from "./host-answer.js";
import { settleOrQueue } from "./snapshot-settle.js";
import {
  type PendingEntry,
  type Settlement,
  type SyncState,
  settlement,
} from "./sync-state.js";

export { settlement };

import type { HostAnswer } from "./sync-types.js";

export interface SubmitDeps {
  readonly validators: readonly PatchValidator[];
  readonly onSubmit: (submission: Submission) => Promise<HostAnswer>;
}

const thrown = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export function refuse(
  state: SyncState,
  sub: Submission,
  rejection: Rejection,
): Rejected {
  state.hub.emit("failure", {
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

export function staleness(
  state: SyncState,
  sub: Submission,
): Rejection | undefined {
  const now = state.displayed.reader.revision();
  return sub.baseRevision === now
    ? undefined
    : rejectionOf(
        "stale-revision",
        `The edit was planned against revision ${String(sub.baseRevision)}, but the model is at revision ${now}`,
      );
}

function startTimer(state: SyncState, entry: PendingEntry): void {
  const ms = state.timeoutMs;
  if (ms === undefined) return;
  entry.timer = state.timers.setTimeout(() => {
    entry.timer = undefined;
    settleOrQueue(state, entry.operationId, {
      status: "unknown",
      reason: `The host did not answer within ${ms} ms`,
    });
  }, ms);
}

function handOver(
  state: SyncState,
  deps: SubmitDeps,
  entry: PendingEntry,
): void {
  if (state.disposed || !state.entries.includes(entry)) return;
  const id: OperationId = entry.operationId;
  const answerUnknown = (reason: string) =>
    settleOrQueue(state, id, { status: "unknown", reason });
  let answer: Promise<HostAnswer>;
  try {
    answer = Promise.resolve(deps.onSubmit(entry.submission));
  } catch (error) {
    answerUnknown(`The host callback threw: ${thrown(error)}`);
    return;
  }
  startTimer(state, entry);
  answer.then(
    (value) => {
      const read = readAnswer(value);
      if (typeof read !== "string") settleOrQueue(state, id, read);
      else answerUnknown(`The host answered with a malformed value: ${read}`);
    },
    (error: unknown) =>
      answerUnknown(`The host callback failed: ${thrown(error)}`),
  );
}

/**
 * Apply a checked submission and schedule its hand-over. Returns a rejection when a
 * validator refused it, an acceptance for an empty patch (nothing for the host to
 * confirm), or undefined once it is pending.
 */
export function runSubmission(
  state: SyncState,
  deps: SubmitDeps,
  sub: Submission,
  resolve: (outcome: Settlement) => void,
): Accepted | Rejected | undefined {
  const { store, reader } = state.displayed;
  const result = applyPatch(store, reader, sub.patch, deps.validators, {
    origin: sub.origin,
    operationId: sub.operationId,
  });
  if (!result.ok) return refuse(state, sub, result.rejection);
  const applied = result.value;
  state.cursor = advanceCursor(state.generator, state.cursor, sub.patch);
  if (applied.patch.ops.length === 0) {
    return {
      ok: true,
      status: "accepted",
      operationId: sub.operationId,
      revision: applied.revision,
      changed: applied.changed,
    };
  }
  const entry: PendingEntry = {
    operationId: sub.operationId,
    submission: sub,
    patch: applied.patch,
    state: "pending",
    resolve,
  };
  state.entries.push(entry);
  state.notifyCommit({
    kind: "change",
    patch: applied.patch,
    origin: sub.origin,
  });
  state.hub.dispatch(() => {
    state.hub.emit("change", {
      revision: applied.revision,
      patch: applied.patch,
      origin: sub.origin,
      operationId: sub.operationId,
      changed: applied.changed,
    });
    state.history.committed(sub, applied.patch);
    state.history.announce();
  });
  void state.hub.defer(
    () => handOver(state, deps, entry),
    () => undefined,
  );
  return undefined;
}

/** `submit`: check now, run now or after the current dispatch. */
export function submitTo(
  state: SyncState,
  deps: SubmitDeps,
  sub: Submission,
  reserve: (sub: Submission) => () => void,
): SubmitResult {
  const stale = staleness(state, sub);
  if (stale) return refuse(state, sub, stale);
  const { settled, resolve } = settlement(state, sub.operationId);
  if (!state.hub.isDispatching()) {
    const done = runSubmission(state, deps, sub, resolve);
    if (done) {
      resolve(done);
      return done;
    }
    return { status: "pending", operationId: sub.operationId, settled };
  }
  const release = reserve(sub);
  void state.hub.defer(
    () => {
      try {
        const done = runSubmission(state, deps, sub, resolve);
        if (done) resolve(done);
      } finally {
        release();
      }
    },
    () => {
      release();
      resolve({
        ok: false,
        status: "rejected",
        operationId: sub.operationId,
        rejection: rejectionOf(
          "disposed",
          "The model was disposed before this edit ran",
        ),
      });
    },
  );
  return { status: "queued", operationId: sub.operationId, settled };
}
