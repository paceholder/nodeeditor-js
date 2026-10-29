/**
 * Model events (TXN-10).
 *
 * `change` carries the committed patch and is delivered in commit order. `reset` replaces
 * the whole document and carries no patch: listeners discard derived state and re-read.
 * Selection, viewport and hover events belong to the view layer.
 */

import type { Rejection } from "../../base/result.js";
import type {
  ChangedIds,
  ChangeOrigin,
  Patch,
} from "../../data/patch/types.js";
import type { HistoryState, OperationId, Revision } from "../adapter/types.js";

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

export interface ModelEventMap {
  readonly change: ChangeEvent;
  readonly failure: FailureEvent;
  readonly history: HistoryEvent;
  readonly reset: ResetEvent;
}

export type ModelEventType = keyof ModelEventMap;
export type Unsubscribe = () => void;
