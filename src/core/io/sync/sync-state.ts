/**
 * Internal state shared by the parts of the snapshot adapter.
 *
 * Two stores: `displayed` is the read model everybody reads; `confirmed` holds what the
 * host last said (the last pushed snapshot, advanced by the edits it accepted since). The
 * pending entries sit between them, in submission order.
 */
import type { IdCursor, IdGenerator } from "../../base/ids/id-generator.js";
import type {
  ConnectionId,
  NodeId,
  OperationId,
  PortId,
} from "../../base/ids/ids.js";
import type { GraphReader } from "../../data/model/reader.js";
import { createGraphReader } from "../../data/model/reader.js";
import { createGraphStore, type GraphStore } from "../../data/model/store.js";
import { changedIds } from "../../data/patch/apply.js";
import type { Patch } from "../../data/patch/types.js";
import type {
  Accepted,
  CommitNotice,
  Rejected,
  Submission,
  UnknownOutcome,
} from "../../edit/adapter/types.js";
import type { EventHub } from "../../edit/events/event-hub.js";
import type { DelegatedIntent } from "../../edit/intents/delegated-types.js";
import type { VerdictTimers } from "../../edit/policy/verdict-env.js";
import type {
  PayloadCodecRegistry,
  SnapshotLimits,
} from "../snapshot/snapshot-errors.js";
import type {
  PendingEditState,
  SyncLogEntry,
  UnconfirmedIds,
} from "./sync-types.js";

export type Settlement = Accepted | Rejected | UnknownOutcome;

export interface PendingEntry {
  readonly operationId: OperationId;
  readonly submission: Submission;
  /** As applied to the displayed store (adds carry their `seq`). */
  readonly patch: Patch;
  state: PendingEditState;
  reason?: string;
  /** Handle of the running answer timeout, if any. */
  timer?: unknown;
  /** Resolves the submission's `settled` promise; later calls do nothing. */
  readonly resolve: (outcome: Settlement) => void;
}

/** A delegated creation waiting for the host's answer or for its node to arrive. */
export interface CreationEntry {
  readonly operationId: OperationId;
  readonly intent: DelegatedIntent;
  state: "pending" | "unknown";
  /**
   * The host has given its answer; later answers are logged no-ops until the outcome
   * becomes unknown, when the host settles the creation again.
   */
  answered: boolean;
  /** The ID the host named, until a pushed snapshot holds it. */
  claimed?: NodeId;
  /**
   * The confirmed state when the creation was handed over: a named ID found there
   * belongs to a node that existed before, not to the one created.
   */
  readonly before: GraphReader;
  timer?: unknown;
  readonly resolve: (outcome: Settlement) => void;
}

/** A store and its reader, replaced together. */
export interface StoreView {
  readonly store: GraphStore;
  readonly reader: GraphReader;
}

export function createStoreView(freezeRecords: boolean): StoreView {
  const store = createGraphStore({ freezeRecords });
  return { store, reader: createGraphReader(store) };
}

/** How an entry left the pending layer, or that it became unknown. */
export type EntryFate = "accepted" | "rejected" | "conflicted" | "unknown";

/**
 * What the history keeper hears from the edit flow. `committed` runs right after a
 * submission was applied to the display, `settled` when an entry's fate is known, and
 * `announce` at the end of every such step, to publish a `history` event when the state
 * changed. All run inside the adapter's dispatch.
 */
export interface HistoryHooks {
  committed(sub: Submission, patch: Patch): void;
  settled(operationId: OperationId, fate: EntryFate): void;
  announce(): void;
}

export const NO_HISTORY_HOOKS: HistoryHooks = {
  committed: () => {},
  settled: () => {},
  announce: () => {},
};

export interface SyncState {
  readonly displayed: StoreView;
  confirmed: StoreView;
  /** Whether stores freeze their records (the confirmed state is readable by hosts). */
  readonly freeze: boolean;
  readonly hub: EventHub;
  /** Set once by the adapter, after the history keeper is built. */
  history: HistoryHooks;
  readonly entries: PendingEntry[];
  /** Unsettled delegated creations, in delegation order. */
  readonly creations: CreationEntry[];
  readonly generator: IdGenerator;
  cursor: IdCursor;
  readonly codecs: PayloadCodecRegistry | undefined;
  readonly pushLimits: Partial<SnapshotLimits> | undefined;
  readonly timeoutMs: number | undefined;
  readonly compareRevisions: (a: unknown, b: unknown) => number;
  /** The host revision of the last applied push that carried one. */
  lastHostRevision: { readonly value: unknown } | undefined;
  readonly timers: VerdictTimers;
  readonly log: (entry: SyncLogEntry) => void;
  readonly notifyCommit: (notice: CommitNotice) => void;
  readonly mint: () => OperationId;
  /** Resolvers of unresolved `settled` promises and their operations, for `dispose`. */
  readonly unsettled: Map<(outcome: Settlement) => void, OperationId>;
  disposed: boolean;
}

export const findEntry = (
  state: SyncState,
  operationId: OperationId,
): PendingEntry | undefined =>
  state.entries.find((e) => e.operationId === operationId);

/**
 * The entities a displayed edit awaiting the host touches directly. Conflicted edits are
 * not displayed, so what they touch shows confirmed state.
 */
export function unconfirmedOf(
  entries: readonly PendingEntry[],
): UnconfirmedIds {
  const nodes = new Set<NodeId>();
  const ports = new Set<PortId>();
  const connections = new Set<ConnectionId>();
  for (const entry of entries) {
    if (entry.state === "conflicted") continue;
    for (const op of entry.patch.ops) {
      const id = op.op === "update" ? op.id : op.record.id;
      if (op.entity === "node") nodes.add(id as NodeId);
      else if (op.entity === "port") ports.add(id as PortId);
      else if (op.entity === "connection") connections.add(id as ConnectionId);
    }
  }
  return { nodes, ports, connections };
}

/** Every ID an entry's patch touches, with the end nodes of its connections. */
export function involvedIn(entry: PendingEntry): string[] {
  const c = changedIds(entry.patch.ops);
  return [...c.nodes, ...c.ports, ...c.connections];
}

export function removeEntry(state: SyncState, entry: PendingEntry): void {
  const at = state.entries.indexOf(entry);
  if (at >= 0) state.entries.splice(at, 1);
  if (entry.timer !== undefined) {
    state.timers.clearTimeout(entry.timer);
    entry.timer = undefined;
  }
}

/** A promise of the final outcome and its resolver, tracked for `dispose`. */
export function settlement(
  state: SyncState,
  operationId: OperationId,
): {
  readonly settled: Promise<Settlement>;
  readonly resolve: (outcome: Settlement) => void;
} {
  let resolveIt: (outcome: Settlement) => void = () => {};
  const settled = new Promise<Settlement>((resolve) => {
    resolveIt = resolve;
  });
  const resolve = (outcome: Settlement): void => {
    state.unsettled.delete(resolve);
    resolveIt(outcome);
  };
  state.unsettled.set(resolve, operationId);
  return { settled, resolve };
}
