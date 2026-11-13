/**
 * Delegated node creation in the snapshot adapter.
 *
 * The host names created nodes and their ports, so a creation is handed to `onDelegate`
 * as an intent and nothing is shown until a pushed snapshot holds the node. Meanwhile
 * the creation keeps a placeholder (`placeholdersOf`). The host answers with the ID it
 * gave the node; the creation settles accepted with that ID once the confirmed state
 * holds a node with it (at once when a push already brought it). Matching is by that ID
 * only. An ID another creation claimed, one an unsettled local edit adds, or one a node
 * had before the hand-over, is refused with `node-id-claimed`. Silence past `timeoutMs`,
 * or a named node that does not arrive in time, makes the outcome unknown: the
 * placeholder stays, marked unknown, and resynchronization is requested. The host then
 * settles it like any unknown edit, even when it had answered before. A fragment (paste
 * or duplicate) settles from the answer alone, since the host names its nodes without
 * telling which they are.
 */
import type { NodeId, OperationId } from "../../base/ids/ids.js";
import { type Rejection, rejectionOf } from "../../base/result.js";
import type { CreationEntry, SyncState } from "./sync-state.js";
import type { CreationPlaceholder, HostAnswer } from "./sync-types.js";

export const findCreation = (
  state: SyncState,
  operationId: OperationId,
): CreationEntry | undefined =>
  state.creations.find((c) => c.operationId === operationId);

function remove(state: SyncState, entry: CreationEntry): void {
  const at = state.creations.indexOf(entry);
  if (at >= 0) state.creations.splice(at, 1);
  if (entry.timer !== undefined) state.timers.clearTimeout(entry.timer);
  entry.timer = undefined;
}

function complete(state: SyncState, entry: CreationEntry, id?: NodeId): void {
  remove(state, entry);
  const ports = id ? (state.confirmed.reader.getNode(id)?.ports ?? []) : [];
  entry.resolve({
    ok: true,
    status: "accepted",
    operationId: entry.operationId,
    revision: state.displayed.reader.revision(),
    changed: { nodes: id ? [id] : [], ports, connections: [], groups: [] },
    ...(id ? { nodeId: id } : {}),
  });
}

function refuse(
  state: SyncState,
  entry: CreationEntry,
  rejection: Rejection,
): void {
  remove(state, entry);
  state.hub.emit("failure", {
    source: "rejection",
    operationId: entry.operationId,
    origin: "local",
    rejection,
  });
  entry.resolve({
    ok: false,
    status: "rejected",
    operationId: entry.operationId,
    rejection,
  });
}

export function markUnknown(
  state: SyncState,
  entry: CreationEntry,
  reason: string,
): void {
  if (entry.timer !== undefined) state.timers.clearTimeout(entry.timer);
  entry.timer = undefined;
  entry.state = "unknown";
  state.log({
    operationId: entry.operationId,
    message: `Creation ${entry.operationId} has an unknown outcome: ${reason}`,
  });
  entry.resolve({
    ok: false,
    status: "unknown",
    operationId: entry.operationId,
    reason,
  });
  state.hub.emit("resync-requested", {
    operationId: entry.operationId,
    reason,
  });
}

/** Why an answer cannot settle this creation, or undefined when it can. */
export function creationAnswerProblem(
  entry: CreationEntry,
  answer: HostAnswer,
): string | undefined {
  return entry.intent.kind === "create-node" &&
    answer.status === "accepted" &&
    answer.nodeId === undefined
    ? "an accepted node creation must name the node's ID"
    : undefined;
}

/** Whether an unsettled local edit adds a node with `id`. */
const editAdds = (state: SyncState, id: NodeId): boolean =>
  state.entries.some((e) =>
    e.patch.ops.some(
      (op) => op.op === "add" && op.entity === "node" && op.record.id === id,
    ),
  );

function claim(state: SyncState, entry: CreationEntry, id: NodeId): void {
  const taken =
    entry.before.getNode(id) !== undefined ||
    state.creations.some((c) => c !== entry && c.claimed === id) ||
    editAdds(state, id);
  if (taken) {
    state.log({
      operationId: entry.operationId,
      message: `Creation ${entry.operationId} named node ${id}, which is already claimed`,
    });
    refuse(
      state,
      entry,
      rejectionOf(
        "node-id-claimed",
        `The host named node ${id} for this creation, but that ID is already claimed`,
        [id],
      ),
    );
    return;
  }
  entry.claimed = id;
  if (state.confirmed.reader.getNode(id)) complete(state, entry, id);
}

/** Apply one answer to a creation now. True when it settled or changed the entry. */
export function settleCreation(
  state: SyncState,
  entry: CreationEntry,
  answer: HostAnswer,
): boolean {
  const problem = creationAnswerProblem(entry, answer);
  // After an unknown outcome the host settles the creation again (as for an edit).
  const ignored =
    (entry.answered && entry.state !== "unknown") ||
    problem !== undefined ||
    (answer.status === "unknown" && entry.state === "unknown");
  if (ignored) {
    state.log({
      operationId: entry.operationId,
      message: `Answer ${answer.status} for creation ${entry.operationId} ignored: ${problem ?? "it already has an answer"}`,
    });
    return false;
  }
  state.hub.dispatch(() => {
    if (answer.status === "unknown") {
      markUnknown(state, entry, answer.reason);
      return;
    }
    entry.answered = true;
    if (answer.status === "rejected") refuse(state, entry, answer.rejection);
    else if (answer.nodeId) claim(state, entry, answer.nodeId);
    else complete(state, entry);
  });
  return true;
}

/** Settle every creation whose named node the confirmed state now holds. */
export function settleArrivals(state: SyncState): void {
  for (const entry of [...state.creations]) {
    const id = entry.claimed;
    if (id && state.confirmed.reader.getNode(id)) complete(state, entry, id);
  }
}

export function dropCreations(state: SyncState, rejection: Rejection): void {
  for (const entry of [...state.creations]) {
    remove(state, entry);
    entry.resolve({
      ok: false,
      status: "rejected",
      operationId: entry.operationId,
      rejection,
    });
  }
}

const NO_PLACEHOLDERS: readonly CreationPlaceholder[] = Object.freeze([]);

export function placeholdersOf(
  state: SyncState,
): readonly CreationPlaceholder[] {
  if (state.creations.length === 0) return NO_PLACEHOLDERS;
  return state.creations.flatMap((entry): CreationPlaceholder[] => {
    const base = {
      operationId: entry.operationId,
      state: entry.state,
      ...(entry.claimed ? { nodeId: entry.claimed } : {}),
    };
    const { intent } = entry;
    if (intent.kind === "create-node")
      return [{ ...base, type: intent.type, position: intent.position }];
    return intent.nodes.map((n) => ({
      ...base,
      type: n.type,
      key: n.key,
      position: {
        x: n.position.x + intent.offset.x,
        y: n.position.y + intent.offset.y,
      },
    }));
  });
}
