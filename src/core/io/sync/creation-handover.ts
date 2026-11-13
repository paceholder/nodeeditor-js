/**
 * Handing a delegated creation to the host.
 *
 * `delegate` registers the creation (and so its placeholder) and calls `onDelegate` while
 * the adapter dispatches, so a push or `settle` made inside the callback is queued. The
 * answer, a malformed answer (which becomes unknown) and the timeout all go through the
 * creation settle rules in `creation-flow.ts`. The timeout runs from the hand-over and
 * covers both the host's answer and the arrival of the node it named.
 */
import type { OperationId } from "../../base/ids/ids.js";
import { MisuseError, rejectionOf } from "../../base/result.js";
import type { SubmitResult } from "../../edit/adapter/types.js";
import type { DelegatedIntent } from "../../edit/intents/delegated-types.js";
import {
  creationAnswerProblem,
  findCreation,
  markUnknown,
  settleCreation,
} from "./creation-flow.js";
import { readAnswer } from "./host-answer.js";
import {
  type CreationEntry,
  type SyncState,
  settlement,
} from "./sync-state.js";
import type { HostAnswer } from "./sync-types.js";

export type OnDelegate = (intent: DelegatedIntent) => Promise<HostAnswer>;

const thrown = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

function answerOrQueue(
  state: SyncState,
  operationId: OperationId,
  answer: HostAnswer,
): void {
  const run = () => {
    const entry = findCreation(state, operationId);
    if (!state.disposed && entry) settleCreation(state, entry, answer);
  };
  if (state.hub.isDispatching()) void state.hub.defer(run, () => undefined);
  else run();
}

function handOver(
  state: SyncState,
  onDelegate: OnDelegate,
  entry: CreationEntry,
): void {
  const id = entry.operationId;
  const unknown = (reason: string) =>
    answerOrQueue(state, id, { status: "unknown", reason });
  let answer: Promise<HostAnswer>;
  try {
    answer = Promise.resolve(onDelegate(entry.intent));
  } catch (error) {
    unknown(`The host callback threw: ${thrown(error)}`);
    return;
  }
  const ms = state.timeoutMs;
  if (ms !== undefined)
    entry.timer = state.timers.setTimeout(() => {
      entry.timer = undefined;
      const expire = () => {
        if (state.creations.includes(entry) && entry.state === "pending")
          state.hub.dispatch(() =>
            markUnknown(
              state,
              entry,
              entry.claimed
                ? `Node ${entry.claimed} did not arrive within ${ms} ms`
                : `The host did not answer within ${ms} ms`,
            ),
          );
      };
      if (state.hub.isDispatching()) void state.hub.defer(expire, () => {});
      else expire();
    }, ms);
  answer.then(
    (value) => {
      const read = readAnswer(value);
      if (typeof read === "string")
        unknown(`The host answered with a malformed value: ${read}`);
      else {
        const problem = creationAnswerProblem(entry, read);
        if (problem) unknown(`The host answered badly: ${problem}`);
        else answerOrQueue(state, id, read);
      }
    },
    (error: unknown) => unknown(`The host callback failed: ${thrown(error)}`),
  );
}

/** `delegate`: register the creation and hand it over, now or after the dispatch. */
export function delegateTo(
  state: SyncState,
  onDelegate: OnDelegate,
  intent: DelegatedIntent,
): SubmitResult {
  if (
    typeof intent !== "object" ||
    intent === null ||
    (intent.kind !== "create-node" &&
      intent.kind !== "create-fragment" &&
      intent.kind !== "duplicate")
  )
    throw new MisuseError(
      "delegate expects a create-node, create-fragment or duplicate intent",
    );
  if (findCreation(state, intent.operationId))
    throw new MisuseError(
      `Creation ${intent.operationId} was already handed over`,
    );
  const { settled, resolve } = settlement(state, intent.operationId);
  const status = state.hub.isDispatching() ? "queued" : "pending";
  void state.hub.defer(
    () => {
      const entry: CreationEntry = {
        operationId: intent.operationId,
        intent,
        state: "pending",
        answered: false,
        before: state.confirmed.reader,
        resolve,
      };
      state.creations.push(entry);
      handOver(state, onDelegate, entry);
    },
    () =>
      resolve({
        ok: false,
        status: "rejected",
        operationId: intent.operationId,
        rejection: rejectionOf(
          "disposed",
          "The model was disposed before this creation was handed over",
        ),
      }),
  );
  return { status, operationId: intent.operationId, settled };
}

/** Every creation settles as rejected with `rejection`, without any event. */
