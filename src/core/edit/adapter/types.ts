/**
 * Adapter contract.
 *
 * Every editing path submits a `Submission` and gets one of three outcomes. Terminal
 * outcomes (`Accepted`, `Rejected`) carry `ok`, so they are `Result`-shaped. `Deferred`
 * has no `ok`: callers must check `status`, so a pending edit can never be mistaken for an
 * accepted one. The local adapter answers synchronously; external adapters (later) answer
 * with `pending` and settle through `settled`.
 */

import type { OperationId } from "../../base/ids/ids.js";
import type { Rejection } from "../../base/result.js";
import type { Revision } from "../../base/revision.js";
import type {
  ChangedIds,
  ChangeOrigin,
  Patch,
} from "../../data/patch/types.js";

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
}

export interface ModelAdapter {
  readonly authority: "local" | "external";
  readonly history: "local" | "host";
  submit(submission: Submission): SubmitResult;
  undo(): SubmitResult;
  redo(): SubmitResult;
  historyState(): HistoryState;
  dispose(): void;
}
