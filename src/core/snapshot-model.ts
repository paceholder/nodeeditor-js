/**
 * The graph model over the snapshot adapter, for a host that owns the document.
 *
 * Commands, policy, validators and views work as on a local model. Edits show at once and
 * wait for the host's answer; the host pushes whole snapshots of its document, which the
 * model applies as incremental external changes. `idGenerator` is required: the IDs the
 * editor issues (connections) must be unique across every client of the host document.
 */
import type { OperationId } from "./base/ids/ids.js";
import {
  buildGraphModel,
  type GraphModel,
  type GraphModelSettings,
} from "./graph-model.js";
import { createSnapshotAdapter } from "./io/sync/snapshot-adapter.js";
import type {
  CreationPlaceholder,
  HostAnswer,
  PendingEdit,
  PushResult,
  SnapshotAdapterBaseOptions,
  SnapshotCreationOptions,
  SnapshotHistoryOptions,
  UnconfirmedIds,
} from "./io/sync/sync-types.js";

/**
 * Snapshot model options. `payloadCodecs` decode both pasted fragments and pushed
 * snapshots, and `timeoutMs` is the one wait for everything the host answers (edits,
 * undo and redo, and the connection validator).
 */
export type SnapshotModelOptions = Omit<SnapshotAdapterBaseOptions, "codecs"> &
  SnapshotHistoryOptions &
  SnapshotCreationOptions &
  GraphModelSettings;

export interface SnapshotModel extends GraphModel {
  /**
   * Make `snapshot` the confirmed state and show it with the pending edits that still
   * apply, as one change of origin `external`. Not a reset: history, selection of
   * surviving entities and gestures on untouched entities are kept. `revision` is the
   * host's own token for the snapshot (compared with `compareRevisions`, numeric by
   * default): a push older than the last applied one is ignored as stale. It is never
   * the library's revision.
   */
  pushSnapshot(snapshot: unknown, revision?: unknown): PushResult;
  /** Every unsettled edit in submission order, with its state. */
  pendingEdits(): readonly PendingEdit[];
  /**
   * The placeholders of delegated creations still waiting for the host or for their
   * node to arrive. Not part of the read model and never serialized.
   */
  placeholders(): readonly CreationPlaceholder[];
  /**
   * The nodes, ports and connections a displayed edit still awaiting the host touches: the
   * host has not confirmed their latest edit. A mounted view hands this to painters as
   * the `unconfirmed` flag; the library draws nothing for it.
   */
  unconfirmed(): UnconfirmedIds;
  /**
   * Answer an edit or a delegated creation later (after a resynchronization, say).
   * Returns false when nothing was settled: an unknown or already settled operation, or
   * an answer its state ignores.
   */
  settle(operationId: OperationId, answer: HostAnswer): boolean;
}

export function createSnapshotModel(
  options: SnapshotModelOptions,
): SnapshotModel {
  const adapter = createSnapshotAdapter({
    ...options,
    ...(options?.payloadCodecs ? { codecs: options.payloadCodecs } : {}),
  });
  const model = buildGraphModel(adapter, options);
  return {
    ...model,
    pushSnapshot: (snapshot, revision) =>
      adapter.pushSnapshot(snapshot, revision),
    pendingEdits: () => adapter.pendingEdits(),
    placeholders: () => adapter.placeholders(),
    unconfirmed: () => adapter.unconfirmed(),
    settle: (operationId, answer) => adapter.settle(operationId, answer),
  };
}
