/**
 * Connection-choice hook types (D3). The view ships no picker: when the policy
 * offers several alternatives for the release target, it asks one host function, which
 * answers with an option key or `undefined`, now or later.
 */
import type { ConnectionPlan, Endpoint, Point } from "../../../core/index.js";

/** One policy alternative for the target, in policy order. */
export interface ConnectionChoiceOption {
  /** The policy's alternative key; return it to choose this option. */
  readonly key: string;
  readonly connectionKind: string;
  /** The policy's label, else a short endpoint description. */
  readonly label: string;
  readonly plan: ConnectionPlan;
}

export interface ConnectionChoiceRequest {
  readonly source: Endpoint;
  readonly target: Endpoint;
  readonly options: readonly ConnectionChoiceOption[];
  /** The release position, for placing a picker. */
  readonly client: { readonly x: number; readonly y: number };
  readonly viewport: Point<"viewport">;
  readonly world: Point<"world">;
  /** Aborted when the choice is cancelled (Escape, a new press, removal, dispose). */
  readonly signal: AbortSignal;
}

/**
 * Returns the chosen option's key, or `undefined` to decline. A rejected promise, a
 * thrown error or an unknown key count as declining.
 */
export type ConnectionChooser = (
  request: ConnectionChoiceRequest,
) => string | undefined | Promise<string | undefined>;
