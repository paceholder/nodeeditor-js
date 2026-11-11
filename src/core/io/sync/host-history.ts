/**
 * Host-owned history for the snapshot adapter.
 *
 * No local stack exists and nothing is recorded. Undo and redo call the host's callbacks
 * and are pending until the host answers; their effect arrives as an ordinary push.
 * Availability and labels come from the host's `historyState` provider, which is read
 * whenever the state is asked for; a `history` event is published after a commit, a push
 * or an answer whenever the provider's value changed.
 */
import type { OperationId } from "../../base/ids/ids.js";
import type { SubmitResult } from "../../edit/adapter/types.js";
import { readAnswer } from "./host-answer.js";
import { refuse, settlement } from "./submit-flow.js";
import {
  emptyStep,
  historyAnnouncer,
  type SyncHistory,
  stepOrQueue,
  unavailable,
} from "./sync-history.js";
import type { SyncState } from "./sync-state.js";
import type { HostAnswer, SnapshotHistoryOptions } from "./sync-types.js";

type HostHistory = Extract<SnapshotHistoryOptions, { history: "host" }>;

const thrown = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export function createHostSyncHistory(
  state: SyncState,
  host: HostHistory,
): SyncHistory {
  const read = () => host.historyState();
  const announce = historyAnnouncer(state, read);

  function step(kind: "undo" | "redo", operationId: OperationId): SubmitResult {
    const now = read();
    if (!(kind === "undo" ? now.canUndo : now.canRedo))
      return refuse(
        state,
        emptyStep(state, kind, operationId),
        unavailable(now, kind),
      );
    const { settled, resolve } = settlement(state, operationId);
    let answered = false;
    let timer: unknown;
    const finish = (answer: HostAnswer): void => {
      if (answered || state.disposed) return;
      answered = true;
      if (timer !== undefined) state.timers.clearTimeout(timer);
      if (answer.status === "accepted") {
        resolve({
          ok: true,
          status: "accepted",
          operationId,
          revision: state.displayed.reader.revision(),
          changed: { nodes: [], ports: [], connections: [] },
        });
      } else if (answer.status === "rejected") {
        refuse(state, emptyStep(state, kind, operationId), answer.rejection);
        resolve({
          ok: false,
          status: "rejected",
          operationId,
          rejection: answer.rejection,
        });
      } else {
        state.log({
          operationId,
          message: `The host's ${kind} ${operationId} has an unknown outcome: ${answer.reason}`,
        });
        resolve({
          ok: false,
          status: "unknown",
          operationId,
          reason: answer.reason,
        });
        state.hub.emit("resync-requested", {
          operationId,
          reason: answer.reason,
        });
      }
      announce();
    };
    const unknown = (reason: string) => finish({ status: "unknown", reason });
    let answer: Promise<HostAnswer>;
    try {
      answer = Promise.resolve(
        (kind === "undo" ? host.onUndo : host.onRedo)({ operationId }),
      );
    } catch (error) {
      unknown(`The host callback threw: ${thrown(error)}`);
      return { status: "pending", operationId, settled };
    }
    const ms = state.timeoutMs;
    if (ms !== undefined)
      timer = state.timers.setTimeout(() => {
        timer = undefined;
        unknown(`The host did not answer within ${ms} ms`);
      }, ms);
    answer.then(
      (value) => {
        const checked = readAnswer(value);
        if (typeof checked === "string")
          unknown(`The host answered with a malformed value: ${checked}`);
        else finish(checked);
      },
      (error: unknown) => unknown(`The host callback failed: ${thrown(error)}`),
    );
    return { status: "pending", operationId, settled };
  }

  return {
    committed: () => {},
    settled: () => {},
    announce,
    undo: () => stepOrQueue(state, "undo", step),
    redo: () => stepOrQueue(state, "redo", step),
    state: read,
    clear: () => {},
  };
}
