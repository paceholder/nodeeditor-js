/**
 * Capability contracts (MOD-11).
 *
 * `CapabilityAction` is defined with the records, since records carry per-action
 * overrides. Resolution order: model read-only, host policy, record override, type
 * default, then allow.
 */
import type { GraphReader } from "../../data/model/reader.js";
import type {
  CapabilityAction,
  CapabilityOverrides,
  NodeRecord,
} from "../../data/model/records.js";

export type { CapabilityAction, CapabilityOverrides };

/** Host hook. Return `true`/`false` to decide, or `undefined` to defer to later layers. */
export interface CapabilityPolicy {
  decide(
    action: CapabilityAction,
    node: NodeRecord,
    graph: GraphReader,
  ): boolean | undefined;
}

export interface CapabilityContext {
  /** Read-only mode denies every edit. Evaluated on each call. */
  readOnly(): boolean;
  readonly policy?: CapabilityPolicy;
  /** Capability defaults declared by the node's type. */
  typeDefaults(type: string): CapabilityOverrides | undefined;
}
