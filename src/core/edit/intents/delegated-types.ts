/**
 * Creation intents handed to a host that names nodes and their ports.
 *
 * An adapter whose `nodeCreation` is `"delegated"` never creates a node locally: the
 * planner builds one of these instead of a patch, and the adapter hands it to the host
 * through `delegate`. Unlike the decoded intents, these carry no library IDs for what is
 * to be created, because the host has not named it yet; entities inside a fragment are
 * addressed with keys local to the fragment.
 */
import type { NodeId, OperationId, PortId } from "../../base/ids/ids.js";
import type {
  Payload,
  PortDirection,
  RouteConstraint,
} from "../../data/model/records.js";
import type { Vec2 } from "../../data/model/values.js";

/** Create one node of a registered type; the host names it and its ports. */
export interface DelegatedCreateNode {
  readonly kind: "create-node";
  readonly operationId: OperationId;
  readonly type: string;
  readonly position: Vec2;
  readonly payload?: Payload;
  readonly title?: string;
}

/** A port of a fragment node, by a key local to the fragment (unique in the fragment). */
export interface FragmentPortIntent {
  readonly key: string;
  readonly direction: PortDirection;
  readonly typeKey: string;
  readonly label?: string;
}

/**
 * A fragment node, by a key local to the fragment, at its position in the fragment. Keys
 * are positional (`node-1`, `port-1`, `connection-1`, ...), never IDs of the copied
 * entities, so a duplicate cannot be mistaken for its original.
 */
export interface FragmentNodeIntent {
  readonly key: string;
  readonly type: string;
  readonly position: Vec2;
  readonly title?: string;
  readonly payload: Payload;
  /** Presentation order. */
  readonly ports: readonly FragmentPortIntent[];
}

/** A connection end: a fragment port by its keys, or an existing port of the model. */
export type FragmentEndpoint =
  | { readonly in: "fragment"; readonly node: string; readonly port: string }
  | { readonly in: "model"; readonly node: NodeId; readonly port: PortId };

export interface FragmentConnectionIntent {
  readonly key: string;
  /** The connection kind; omitted for the default kind. */
  readonly kind?: string;
  readonly from: FragmentEndpoint;
  readonly to: FragmentEndpoint;
  /** Route constraints in fragment coordinates, before the offset is added. */
  readonly route?: readonly RouteConstraint[];
}

/**
 * Create a validated fragment (paste or duplicate). The host creates the nodes, then the
 * connections between the ports it named, adding `offset` to every fragment position.
 * Connections to existing ports appear only when the command asked to preserve them.
 */
export interface DelegatedCreateFragment {
  readonly kind: "create-fragment";
  readonly operationId: OperationId;
  readonly nodes: readonly FragmentNodeIntent[];
  readonly connections: readonly FragmentConnectionIntent[];
  readonly offset: Vec2;
}

export type DelegatedIntent = DelegatedCreateNode | DelegatedCreateFragment;
