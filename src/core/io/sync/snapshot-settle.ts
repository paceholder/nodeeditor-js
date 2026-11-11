/**
 * Settling pending edits: one table for every answer.
 *
 * | entry      | accepted                    | rejected                          | unknown                    |
 * | ---------- | --------------------------- | --------------------------------- | -------------------------- |
 * | pending    | retired, confirmed advances | retired, display recomputed, fail | becomes unknown, resync    |
 * | conflicted | retired, nothing changes    | retired, failure event            | stays conflicted, logged   |
 * | unknown    | as pending                  | as pending                        | stays unknown, logged      |
 * | none       | logged no-op                | logged no-op                      | logged no-op               |
 *
 * Answers come from the promise `onSubmit` returned and from `settle`. One made while
 * events are being dispatched is applied after the dispatch. `settle` also answers
 * delegated creations, whose own table is in `creation-flow.ts`.
 */
import type { OperationId } from "../../base/ids/ids.js";
import { MisuseError, type Rejection } from "../../base/result.js";
import { changedIds } from "../../data/patch/apply.js";
import {
  creationAnswerProblem,
  dropCreations,
  findCreation,
  settleCreation,
} from "./creation-flow.js";
import { redisplay } from "./display.js";
import { readAnswer } from "./host-answer.js";
import { applyQuietly } from "./rebase.js";
import {
  findEntry,
  involvedIn,
  type PendingEntry,
  removeEntry,
  type SyncState,
} from "./sync-state.js";
import type { HostAnswer, PendingEditState } from "./sync-types.js";

export type SettleEffect =
  | "confirm"
  | "retire"
  | "roll-back"
  | "report"
  | "mark-unknown"
  | "ignore";

/** The settle table: what an answer does to an entry in a given state. */
export function settleEffect(
  state: PendingEditState | undefined,
  answer: HostAnswer["status"],
): SettleEffect {
  if (state === undefined) return "ignore";
  if (state === "conflicted")
    return answer === "accepted"
      ? "retire"
      : answer === "rejected"
        ? "report"
        : "ignore";
  if (answer === "accepted") return "confirm";
  if (answer === "rejected") return "roll-back";
  return state === "pending" ? "mark-unknown" : "ignore";
}

function filled(entry: PendingEntry, rejection: Rejection): Rejection {
  return rejection.entities.length > 0
    ? rejection
    : { ...rejection, entities: involvedIn(entry) };
}

function fail(
  state: SyncState,
  entry: PendingEntry,
  rejection: Rejection,
): void {
  state.hub.emit("failure", {
    source: "rejection",
    operationId: entry.operationId,
    origin: entry.submission.origin,
    rejection,
  });
  entry.resolve({
    ok: false,
    status: "rejected",
    operationId: entry.operationId,
    rejection,
  });
}

function accept(state: SyncState, entry: PendingEntry): void {
  entry.resolve({
    ok: true,
    status: "accepted",
    operationId: entry.operationId,
    revision: state.displayed.reader.revision(),
    changed: changedIds(entry.patch.ops),
  });
}

/** Apply one answer now. True when it settled or changed the entry. */
export function settleNow(
  state: SyncState,
  operationId: OperationId,
  answer: HostAnswer,
): boolean {
  if (state.disposed) return false;
  const entry = findEntry(state, operationId);
  const creation = entry ? undefined : findCreation(state, operationId);
  if (creation) return settleCreation(state, creation, answer);
  const effect = settleEffect(entry?.state, answer.status);
  if (!entry || effect === "ignore") {
    state.log({
      operationId,
      message: entry
        ? `Answer ${answer.status} for edit ${operationId} ignored: it is ${entry.state}`
        : `Answer ${answer.status} for ${operationId} ignored: no unsettled edit has that ID`,
    });
    return false;
  }
  if (effect === "mark-unknown" && answer.status === "unknown") {
    if (entry.timer !== undefined) state.timers.clearTimeout(entry.timer);
    entry.timer = undefined;
    entry.state = "unknown";
    entry.reason = answer.reason;
    state.log({
      operationId,
      message: `Edit ${operationId} has an unknown outcome: ${answer.reason}`,
    });
    entry.resolve({
      ok: false,
      status: "unknown",
      operationId,
      reason: answer.reason,
    });
    state.hub.emit("resync-requested", { operationId, reason: answer.reason });
    state.history.settled(operationId, "unknown");
    return true;
  }
  removeEntry(state, entry);
  state.hub.dispatch(() => {
    if (effect === "confirm") {
      // Already part of confirmed state when a push held it; then it does not apply.
      applyQuietly(state.confirmed, entry.patch);
      state.history.settled(operationId, "accepted");
      accept(state, entry);
    } else if (effect === "retire") {
      state.history.settled(operationId, "accepted");
      accept(state, entry);
    } else if (answer.status === "rejected") {
      state.history.settled(operationId, "rejected");
      const stuck = effect === "roll-back" ? redisplay(state) : undefined;
      fail(state, entry, filled(entry, answer.rejection));
      // The display still shows the refused edit: a fresh push recomputes it.
      if (stuck !== undefined)
        state.hub.emit("resync-requested", {
          operationId,
          reason: `The display still shows this rejected edit, since it could not be recomputed: ${stuck}`,
        });
    }
    state.history.announce();
  });
  return true;
}

/** Apply an answer now, or after the current dispatch when one is running. */
export function settleOrQueue(
  state: SyncState,
  operationId: OperationId,
  answer: HostAnswer,
): boolean {
  if (!state.hub.isDispatching()) return settleNow(state, operationId, answer);
  const waiting =
    findEntry(state, operationId) !== undefined ||
    findCreation(state, operationId) !== undefined;
  void state.hub.defer(
    () => settleNow(state, operationId, answer),
    () => false,
  );
  return waiting;
}

/** `settle` from the host: a malformed answer is misuse. */
export function settleFromHost(
  state: SyncState,
  operationId: OperationId,
  answer: unknown,
): boolean {
  const read = readAnswer(answer);
  if (typeof read === "string")
    throw new MisuseError(`settle: the answer is malformed: ${read}`);
  const creation = findEntry(state, operationId)
    ? undefined
    : findCreation(state, operationId);
  const problem = creation && creationAnswerProblem(creation, read);
  if (problem) throw new MisuseError(`settle: ${problem}`);
  return settleOrQueue(state, operationId, read);
}

/**
 * Every edit, creation and their results settle as rejected with `rejection`, without
 * any event.
 */
export function settleAllSilently(
  state: SyncState,
  rejection: Rejection,
): void {
  for (const entry of [...state.entries]) {
    removeEntry(state, entry);
    entry.resolve({
      ok: false,
      status: "rejected",
      operationId: entry.operationId,
      rejection: filled(entry, rejection),
    });
  }
  dropCreations(state, rejection);
}
