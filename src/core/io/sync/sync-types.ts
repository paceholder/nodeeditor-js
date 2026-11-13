/**
 * Types of the snapshot synchronization adapter.
 *
 * The host owns the document. The adapter shows every local edit at once, hands it to the
 * host's `onSubmit` callback and settles it from the host's answer. Answers arrive as the
 * promise `onSubmit` returns, or later through `settle`. The adapter keeps the confirmed
 * state (what the host last said) apart from the displayed read model, which is always the
 * confirmed state plus the pending edits that still apply.
 */
import type { IdGenerator } from "../../base/ids/id-generator.js";
import type {
  ConnectionId,
  NodeId,
  OperationId,
  PortId,
} from "../../base/ids/ids.js";
import type { Rejection } from "../../base/result.js";
import type { Revision } from "../../base/revision.js";
import type { GraphReader } from "../../data/model/reader.js";
import type { StoreOptions } from "../../data/model/store.js";
import type { Vec2 } from "../../data/model/values.js";
import type { Patch } from "../../data/patch/types.js";
import type {
  HistoryState,
  ModelAdapter,
  Submission,
} from "../../edit/adapter/types.js";
import type { DelegatedIntent } from "../../edit/intents/delegated-types.js";
import type { VerdictTimers } from "../../edit/policy/verdict-env.js";
import type {
  PayloadCodecRegistry,
  SnapshotLimits,
} from "../snapshot/snapshot-errors.js";
import type { SnapshotError } from "../snapshot/snapshot-types.js";

/**
 * The host's answer to one submission or creation. A rejection of an edit whose
 * `entities` is empty gets the IDs the edit touched. An accepted node creation names the
 * ID the host gave the node (built with `nodeId(text)`): the ID the node has in later
 * snapshots, not the ID of the host's own operation record; edits ignore it.
 */
export type HostAnswer =
  | { readonly status: "accepted"; readonly nodeId?: NodeId }
  | { readonly status: "rejected"; readonly rejection: Rejection }
  | { readonly status: "unknown"; readonly reason: string };

/**
 * `pending`: handed to the host, no answer yet. `conflicted`: it no longer applies to the
 * confirmed state, so it is not displayed; the host still settles it. `unknown`: the
 * host could not tell whether it applied; it stays displayed and is never resubmitted.
 */
export type PendingEditState = "pending" | "conflicted" | "unknown";

export interface PendingEdit {
  readonly operationId: OperationId;
  readonly state: PendingEditState;
  readonly label: string;
  /** The patch as it was applied to the displayed read model. */
  readonly patch: Patch;
  /** Plain-text cause of the `unknown` or `conflicted` state. */
  readonly reason?: string;
}

/**
 * Entities that a displayed edit still awaiting the host touches: the host has not
 * confirmed their latest edit. Painters may show them differently; the library does not.
 */
export interface UnconfirmedIds {
  readonly nodes: ReadonlySet<NodeId>;
  readonly ports: ReadonlySet<PortId>;
  readonly connections: ReadonlySet<ConnectionId>;
}

/**
 * A node a delegated creation will add once the host has named it. Never part of the
 * read model, never serialized and never in history; the view may paint it. A paste has
 * one per fragment node, sharing the operation ID; a duplicate by ID has none.
 */
export interface CreationPlaceholder {
  readonly operationId: OperationId;
  readonly type: string;
  /** World position the node was requested at. */
  readonly position: Vec2;
  /** `unknown` once the outcome is unknown; it then stays until settled or arrived. */
  readonly state: "pending" | "unknown";
  /** The fragment-local key of the node, for a delegated paste. */
  readonly key?: string;
  /** The ID the host named in its answer, while the node has not arrived yet. */
  readonly nodeId?: NodeId;
}

/** A note about an answer that changed nothing, or a state worth recording. */
export interface SyncLogEntry {
  readonly operationId?: OperationId;
  readonly message: string;
}

/** The outcome of a push that ran. */
export type PushOutcome =
  | {
      readonly ok: true;
      readonly status: "applied";
      /** The library's revision after the push. */
      readonly revision: Revision;
      /** Operations the push applied to the displayed read model; 0 emits nothing. */
      readonly operations: number;
    }
  | {
      readonly ok: true;
      /** The push carried a host revision older than the last applied one. */
      readonly status: "ignored";
      readonly reason: "stale";
      /** The library's revision, unchanged. */
      readonly revision: Revision;
    }
  | {
      readonly ok: false;
      readonly status: "refused";
      /** Every problem, with JSON paths; nothing changed. */
      readonly rejection: readonly SnapshotError[];
    };

/** A push made while events were being dispatched; it runs after the dispatch. */
export interface QueuedPush {
  readonly status: "queued";
  readonly settled: Promise<PushOutcome>;
}

export type PushResult = PushOutcome | QueuedPush;

/** What the host's undo and redo callbacks receive. */
export interface HostHistoryRequest {
  readonly operationId: OperationId;
}

/**
 * Who keeps the undo history. `local` (the default): the adapter keeps a stack of the
 * user's edits in commit order, without pushes; an entry leaves it when the host rejects
 * the edit or it becomes conflicted, and undo waits while the newest edit is unanswered.
 * `host`: undo and redo go to the host's callbacks, availability comes from the host's
 * `historyState`, and the library records nothing; the effect arrives as a push.
 */
export type SnapshotHistoryOptions =
  | {
      readonly history?: "local";
      /** Most undo entries kept (a positive integer). Default: no limit. */
      readonly historyLimit?: number;
    }
  | {
      readonly history: "host";
      readonly onUndo: (request: HostHistoryRequest) => Promise<HostAnswer>;
      readonly onRedo: (request: HostHistoryRequest) => Promise<HostAnswer>;
      /** Read whenever the history state is asked for and after every change. */
      readonly historyState: () => HistoryState;
    };

/** Options of the snapshot adapter apart from who keeps history. */
export interface SnapshotAdapterBaseOptions extends StoreOptions {
  /**
   * Issues the IDs the editor names (connections, and nodes while creation is local). A
   * host-owned document needs IDs that are unique across clients, so there is no default.
   */
  readonly idGenerator: IdGenerator;
  /**
   * Called once per submission, in commit order, without waiting for earlier answers. It
   * runs while the adapter dispatches, so a push or `settle` made inside it is queued.
   */
  readonly onSubmit: (submission: Submission) => Promise<HostAnswer>;
  /**
   * Turn silence into an unknown outcome after this many milliseconds. There is no
   * default: without it the adapter waits for the host indefinitely.
   */
  readonly timeoutMs?: number;
  /** Timer functions for `timeoutMs`; defaults to the global ones. */
  readonly timers?: VerdictTimers;
  /** Size limits for pushed snapshots. Defaults to `DEFAULT_SNAPSHOT_LIMITS`. */
  readonly pushLimits?: Partial<SnapshotLimits>;
  /** Codecs for non-JSON payloads in pushed snapshots. */
  readonly codecs?: PayloadCodecRegistry;
  /**
   * Orders two host revisions (the optional second argument of `pushSnapshot`): negative
   * when `a` is older than `b`, zero when equal, positive when newer. Defaults to numeric
   * order, which accepts only finite numbers.
   */
  readonly compareRevisions?: (a: unknown, b: unknown) => number;
  /** Receives notes about ignored answers and changed edit states. */
  readonly onLog?: (entry: SyncLogEntry) => void;
  /** Receives errors thrown by `failure` handlers. */
  readonly onHandlerError?: (error: unknown) => void;
}

/**
 * Who names new nodes and their ports. `local` (the default): the editor does, with the
 * ID generator, and a creation is an ordinary submission. `delegated`: the host does;
 * creation commands hand `onDelegate` an intent, nothing is shown until a pushed snapshot
 * holds the node the host named, and a placeholder stands in for it meanwhile.
 */
export type SnapshotCreationOptions =
  | { readonly nodeCreation?: "local" }
  | {
      readonly nodeCreation: "delegated";
      /**
       * Called once per creation, while the adapter dispatches. Answer `accepted` with
       * the node's ID (a create-node intent) or plain `accepted` (a fragment or a duplicate), `rejected`
       * with a rejection (for example `unsupported-command`), or `unknown`.
       */
      readonly onDelegate: (intent: DelegatedIntent) => Promise<HostAnswer>;
    };

export type SnapshotAdapterOptions = SnapshotAdapterBaseOptions &
  SnapshotHistoryOptions &
  SnapshotCreationOptions;

export interface SnapshotAdapter extends ModelAdapter {
  readonly authority: "external";
  /**
   * Make `snapshot` the confirmed state and show it with the pending edits that still
   * apply, as one change of origin `external`. Not a reset: history, selection of
   * surviving entities and gestures on untouched entities are kept. `revision` is the
   * host's own token for the snapshot, never the library's revision: a push older than
   * the last applied one is ignored as stale; an equal, newer or missing one is applied.
   */
  pushSnapshot(snapshot: unknown, revision?: unknown): PushResult;
  /** The confirmed state: the last push advanced by the edits the host accepted since. */
  confirmedReader(): GraphReader;
  /** Every unsettled edit in submission order. */
  pendingEdits(): readonly PendingEdit[];
  /** The placeholders of unsettled delegated creations, in delegation order. */
  placeholders(): readonly CreationPlaceholder[];
  /** The entities whose latest displayed edit still awaits the host. */
  unconfirmed(): UnconfirmedIds;
  /**
   * Answer an edit or a delegated creation later (after a resynchronization, say), with
   * the same answer shape as the callbacks. Returns false when nothing was
   * settled: an unknown or already settled operation, or an answer the edit's state
   * ignores. Inside an event handler the answer is applied after the dispatch, and the
   * return value tells whether the edit was still unsettled when the call was made.
   */
  settle(operationId: OperationId, answer: HostAnswer): boolean;
}
