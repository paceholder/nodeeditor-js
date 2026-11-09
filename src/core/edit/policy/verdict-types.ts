/**
 * Host validator contract.
 *
 * A validator answers, asynchronously, whether one connection plan is acceptable. It is a
 * plain function, like the connection chooser, so a host can call any service. The policy
 * itself stays synchronous: verdicts are kept in a cache (`verdict-cache.ts`) that the
 * wrapper policy only reads.
 */
import type { Rejection } from "../../base/result.js";
import type { Revision } from "../../base/revision.js";
import type { Endpoint } from "../../data/model/records.js";

/** The slice of `AbortSignal` the library relies on; core has no DOM or Node types. */
export interface AbortSignalLike {
  readonly aborted: boolean;
  addEventListener(
    type: "abort",
    listener: () => void,
    options?: { readonly once?: boolean },
  ): void;
  removeEventListener(type: "abort", listener: () => void): void;
}

/**
 * The signal a validator receives. Where the host's compilation knows a global
 * `AbortSignal` (DOM or Node types) this resolves to it, so it can be handed straight to
 * `fetch`; otherwise it is the structural subset above. At run time it is always the
 * platform's `AbortSignal`.
 */
export type VerdictSignal = typeof globalThis extends {
  AbortSignal: { prototype: infer S };
}
  ? S
  : AbortSignalLike;

/** What the host is asked about: the connection plan the base policy produced. */
export interface VerdictProposal {
  readonly from: Endpoint;
  readonly to: Endpoint;
  readonly kind: string;
}

export interface VerdictRequest {
  readonly proposal: VerdictProposal;
  /** Model revision at request time, for the host's own bookkeeping. */
  readonly revision: Revision;
  /** Aborted when nothing wants the answer any more. */
  readonly signal: VerdictSignal;
}

export type ConnectionVerdict =
  | { readonly valid: true }
  | { readonly valid: false; readonly rejection: Rejection };

export type ConnectionValidator = (
  request: VerdictRequest,
) => Promise<ConnectionVerdict>;
