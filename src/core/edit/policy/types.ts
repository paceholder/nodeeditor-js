/**
 * Connection policy contract.
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
  /**
   * The key of one alternative of an earlier `choice` outcome. The policy then
   * accepts exactly that alternative or rejects; it must not answer `choice` again.
   */
  readonly choice?: string;
}

/** What an accepted proposal turns into. */
export interface ConnectionPlan {
  /** Normalized orientation: for directed ports `from` is the output. */
  readonly from: Endpoint;
  readonly to: Endpoint;
  readonly connectionKind: string;
  /** Explicit extra effects such as converter nodes. Usually empty. */
  readonly auxiliary: readonly PatchOp[];
}

/**
 * One alternative of a `choice` outcome. The key is unique within the outcome and stable
 * across evaluations of the same proposal on the same graph, so a caller can name it
 * back in `ConnectionProposal.choice`. The accepted plan must record what tells it
 * apart (connection kind, endpoints or auxiliary entities): the commit validator
 * re-evaluates the stored record without a `choice` and must get `accept`.
 */
export interface ConnectionAlternative extends ConnectionPlan {
  readonly key: string;
  /** Display text for a picker; optional. */
  readonly label?: string;
}

export type PolicyOutcome =
  | { readonly kind: "accept"; readonly plan: ConnectionPlan }
  | { readonly kind: "reject"; readonly rejection: Rejection }
  | {
      readonly kind: "choice";
      readonly alternatives: readonly ConnectionAlternative[];
    }
  | {
      readonly kind: "pending";
      readonly reason: string;
      /**
       * The plan awaiting a verdict, when the policy knows it: what a tool passes to the
       * verdict cache to start the request.
       */
      readonly plan?: ConnectionPlan;
    };

export interface ConnectionPolicy {
  evaluate(proposal: ConnectionProposal, graph: GraphReader): PolicyOutcome;
}
