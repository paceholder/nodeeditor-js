/**
 * Model events.
 *
 * `change` carries the committed patch and is delivered in commit order. `reset` replaces
 * the whole document and carries no patch: listeners discard derived state and re-read.
 * Selection, viewport and hover events belong to the view layer.
 */

import type { OperationId } from "../../base/ids/ids.js";
import type { Rejection } from "../../base/result.js";
import type { Revision } from "../../base/revision.js";
import type {
  ChangedIds,
  ChangeOrigin,
  Patch,
} from "../../data/patch/types.js";
import type { HistoryState } from "../adapter/types.js";

export interface ChangeEvent {
  readonly revision: Revision;
  readonly patch: Patch;
  readonly origin: ChangeOrigin;
  readonly operationId: OperationId;
  readonly changed: ChangedIds;
}

export interface ResetEvent {
  readonly revision: Revision;
  readonly origin: ChangeOrigin;
}

export type HistoryEvent = HistoryState;

export type FailureEvent =
  | {
      readonly source: "rejection";
      readonly operationId: OperationId;
      readonly origin: ChangeOrigin;
      readonly rejection: Rejection;
    }
  | {
      readonly source: "handler";
      /** The event type whose handler threw. */
      readonly eventType: keyof ModelEventMap;
      readonly error: unknown;
    };

/**
 * An external adapter cannot tell whether an edit applied (the host said so, or did not
 * answer in time). The host should push a fresh snapshot and then settle the edit. It is
 * also requested when the display could not be recomputed after a rejection (a payload
 * codec failed): the edit is settled, but the display shows it until the next push.
 */
export interface ResyncRequestedEvent {
  readonly operationId: OperationId;
  readonly reason: string;
}

/**
 * A pending edit no longer applies to the authority's confirmed state (a pushed snapshot
 * removed or changed what it edits, or an earlier edit was refused). It has left the
 * display and stays listed as conflicted until the host settles it.
 */
export interface ConflictEvent {
  readonly operationId: OperationId;
  readonly reason: string;
  /** IDs of the entities the edit touches. */
  readonly entities: readonly string[];
}

export interface ModelEventMap {
  readonly change: ChangeEvent;
  readonly failure: FailureEvent;
  readonly history: HistoryEvent;
  readonly reset: ResetEvent;
  readonly "resync-requested": ResyncRequestedEvent;
  readonly conflict: ConflictEvent;
}

export type ModelEventType = keyof ModelEventMap;
export type Unsubscribe = () => void;
