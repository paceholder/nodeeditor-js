/**
 * Connection policy contract (CON-01, CON-04, CON-06).
 *
 * The policy, not the model structure, decides whether a connection is valid. It returns
 * a structured outcome, never a bare Boolean, so callers can explain a refusal, show
 * alternatives, or wait for a host validator.
 */
import type { ConnectionId } from "../../base/ids/ids.js";
import type { Rejection } from "../../base/result.js";
import type { GraphReader } from "../../data/model/reader.js";
import type { Endpoint } from "../../data/model/records.js";
import type { PatchOp } from "../../data/patch/types.js";

export interface ConnectionProposal {
  readonly from: Endpoint;
  readonly to: Endpoint;
  readonly kind?: string;
  /**
   * An existing connection this proposal would replace (reconnect). Occupancy and
   * duplicate checks must ignore it.
   */
  readonly replacing?: ConnectionId;
}

/** What an accepted proposal turns into. */
export interface ConnectionPlan {
  /** Normalized orientation: for directed ports `from` is the output. */
  readonly from: Endpoint;
  readonly to: Endpoint;
  readonly connectionKind: string;
  /** Explicit extra effects such as converter nodes (CON-06). Usually empty. */
  readonly auxiliary: readonly PatchOp[];
}

export type PolicyOutcome =
  | { readonly kind: "accept"; readonly plan: ConnectionPlan }
  | { readonly kind: "reject"; readonly reason: Rejection }
  | {
      readonly kind: "choice";
      readonly alternatives: readonly ConnectionPlan[];
    }
  | { readonly kind: "pending"; readonly reason: string };

export interface ConnectionPolicy {
  evaluate(proposal: ConnectionProposal, graph: GraphReader): PolicyOutcome;
}
