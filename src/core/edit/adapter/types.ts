/**
 * Adapter contract.
 *
 * Every editing path submits a `Submission` and gets one of three outcomes. Terminal
 * outcomes (`Accepted`, `Rejected`) carry `ok`, so they are `Result`-shaped. `Deferred`
 * has no `ok`: callers must check `status`, so a pending edit can never be mistaken for an
 * accepted one. The local adapter answers synchronously; external adapters (later) answer
 * with `pending` and settle through `settled`.
 *
 * `ModelAdapter` is also everything the graph model needs from its adapter: the read
 * model, events, validators, IDs and the reset path, so a model can be built on any
 * adapter without a second adapter interface.
 */

import type { IdCursor, IdGenerator } from "../../base/ids/id-generator.js";
import type { NodeId, OperationId } from "../../base/ids/ids.js";
import type { Rejection, RejectionCode } from "../../base/result.js";
import type { Revision } from "../../base/revision.js";
import type { GraphReader } from "../../data/model/reader.js";
import type {
  AppliedPatch,
  ChangedIds,
  ChangeOrigin,
  Patch,
} from "../../data/patch/types.js";
import type { PatchValidator } from "../../data/patch/validator.js";
import type { EventHub } from "../events/event-hub.js";
import type { DelegatedIntent } from "../intents/delegated-types.js";
import type { DocumentReplacement } from "./replace-document.js";

export interface Submission {
  readonly operationId: OperationId;
  /**
   * The revision the patch was planned against. The local adapter rejects the submission
   * with `stale-revision` when it is not the current revision at submit time.
   */
  readonly baseRevision: Revision;
  readonly patch: Patch;
  /** Human-readable description used for history labels. */
  readonly label: string;
  /** `skip` applies the edit without creating a history entry. */
  readonly history: "record" | "skip";
  readonly origin: ChangeOrigin;
}

export interface Accepted {
  readonly ok: true;
  readonly status: "accepted";
  readonly operationId: OperationId;
  readonly revision: Revision;
  readonly changed: ChangedIds;
  /**
   * The node a creation made: present only on the outcome of a node creation, local
   * (the ID the generator issued) or delegated (the ID the host named).
   */
  readonly nodeId?: NodeId;
}

export interface Rejected {
  readonly ok: false;
  readonly status: "rejected";
  readonly operationId: OperationId;
  readonly rejection: Rejection;
}

/** The authority did not answer in time and the edit may or may not have applied. */
export interface UnknownOutcome {
  readonly ok: false;
  readonly status: "unknown";
  readonly operationId: OperationId;
  readonly reason: string;
}

/** Not decided yet. Has no `ok`; check `status` and await `settled`. */
export interface Deferred {
  readonly status: "queued" | "pending";
  readonly operationId: OperationId;
  readonly settled: Promise<Accepted | Rejected | UnknownOutcome>;
}

export type SubmitResult = Accepted | Rejected | Deferred;

/** Undo and redo availability with human-readable descriptions. */
export interface HistoryState {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoLabel?: string;
  readonly redoLabel?: string;
  /** Why undo is unavailable. Present only when `canUndo` is false. */
  readonly undoReason?: string;
  readonly redoReason?: string;
  /**
   * The rejection code a refused undo carries, when it is not `history-unavailable` (for
   * example `edit-pending` while the newest edit waits for an external authority).
   */
  readonly undoCode?: RejectionCode;
  readonly redoCode?: RejectionCode;
}

/** What a commit listener hears: an applied patch, or a whole-document replacement. */
export type CommitNotice =
  | {
      readonly kind: "change";
      readonly patch: AppliedPatch["patch"];
      readonly origin: Submission["origin"];
    }
  | { readonly kind: "reset" };

export interface ModelAdapter {
  readonly authority: "local" | "external";
  readonly history: "local" | "host";
  /**
   * Who names new nodes and their ports: `local` plans them with IDs from the ID
   * generator; `delegated` hands a creation intent to the host through `delegate`.
   */
  readonly nodeCreation: "local" | "delegated";
  /** The displayed read model; always synchronous. */
  readonly reader: GraphReader;
  readonly idGenerator: IdGenerator;
  on: EventHub["on"];
  /** Register a validator; returns a function that removes it. */
  addValidator(validator: PatchValidator): () => void;
  /** The registered validators in registration order, as commits run them. */
  validators(): readonly PatchValidator[];
  /**
   * Listen to every commit synchronously, right after the read model changed and before
   * any event is delivered or queued edit applied. For caches that must never be stale; a
   * listener must not submit. Returns a function that removes it.
   */
  onCommit(listener: (notice: CommitNotice) => void): () => void;
  /** Current ID cursor; only ever moves forward. */
  idCursor(): IdCursor;
  /**
   * The cursor planners should allocate from: the committed cursor, advanced past every
   * submission still queued, so commands issued from one handler do not collide.
   */
  planningCursor(): IdCursor;
  revision(): Revision;
  mintOperationId(): OperationId;
  /**
   * Replace the whole document atomically, set the ID cursor, clear local history and
   * emit one `reset` event. The replacement is checked first; bad input
   * throws `MisuseError` with nothing changed, as does a call from inside an event
   * handler (its revision could not be returned). `loadSnapshot` is the public entry
   * point, which validates untrusted input into results first.
   */
  replaceDocument(replacement: DocumentReplacement): Revision;
  /** Publish a `failure` event for an edit refused before it reached `submit`. */
  reportRejection(operationId: OperationId, rejection: Rejection): void;
  submit(submission: Submission): SubmitResult;
  /**
   * Hand a creation to the host. Only an adapter whose `nodeCreation` is `delegated`
   * accepts it; any other throws `MisuseError`.
   */
  delegate(intent: DelegatedIntent): SubmitResult;
  undo(): SubmitResult;
  redo(): SubmitResult;
  historyState(): HistoryState;
  dispose(): void;
}
