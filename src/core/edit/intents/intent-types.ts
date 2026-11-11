/**
 * Named intents decoded from a submitted patch.
 *
 * A host whose store offers calls such as "move these nodes" or "connect these ports" maps
 * intents to calls instead of interpreting patch operations. Every intent carries old and
 * new values. Rotation is the absolute number of quarter turns and mirroring the absolute
 * flag, never a step or a toggle, so replaying an intent is harmless. One gesture is one
 * submission, so a gesture that changes several nodes is one intent listing all of them.
 *
 * Each patch operation is claimed by exactly one intent, by the primary field it changes
 * (size, then mirror flag, then rotation, then position for a node; endpoints, then route
 * for a connection). Fields the same operation changes besides the primary one travel with
 * it: a resize carries its position change, a mirror its rotation change, and any further
 * changed fields are listed in `others`.
 */
import type { ConnectionId, NodeId } from "../../base/ids/ids.js";
import type {
  ConnectionRecord,
  Endpoint,
  NodeRecord,
  PortRecord,
  RouteConstraint,
} from "../../data/model/records.js";
import type { QuarterTurns, Size, Vec2 } from "../../data/model/values.js";
import type {
  ConnectionFieldChanges,
  FieldChange,
  NodeFieldChanges,
  PatchOp,
} from "../../data/patch/types.js";

/** Old and new value of a field that is always present. */
export interface Change<V> {
  readonly old: V;
  readonly new: V;
}

/** One node of a move. */
export interface NodeMove extends Change<Vec2> {
  readonly node: NodeId;
  /** Other fields the same operation changes. */
  readonly others?: NodeFieldChanges;
}

/** A pinned route translated along with a move; absent `old`/`new` means no route. */
export interface RouteChange extends FieldChange<readonly RouteConstraint[]> {
  readonly connection: ConnectionId;
  readonly others?: ConnectionFieldChanges;
}

export interface NodeResize extends Change<Size> {
  readonly node: NodeId;
  /** The position change of the same operation (a resize about a fixed point moves it). */
  readonly position?: Change<Vec2>;
  readonly others?: NodeFieldChanges;
}

export interface NodeRotate extends Change<QuarterTurns> {
  readonly node: NodeId;
  readonly others?: NodeFieldChanges;
}

export interface NodeMirror extends Change<boolean> {
  readonly node: NodeId;
  /** The rotation change of the same operation (mirroring about a screen axis may turn). */
  readonly rotation?: Change<QuarterTurns>;
  readonly others?: NodeFieldChanges;
}

export interface ReconnectIntent {
  readonly kind: "reconnect";
  readonly connection: ConnectionId;
  /** Present for each end that changed. */
  readonly from?: Change<Endpoint>;
  readonly to?: Change<Endpoint>;
  readonly others?: ConnectionFieldChanges;
}

export type Intent =
  | {
      readonly kind: "move";
      readonly nodes: readonly NodeMove[];
      /** Route updates of the same patch, folded into the move. */
      readonly routes: readonly RouteChange[];
    }
  | { readonly kind: "resize"; readonly nodes: readonly NodeResize[] }
  | { readonly kind: "rotate"; readonly nodes: readonly NodeRotate[] }
  | { readonly kind: "mirror"; readonly nodes: readonly NodeMirror[] }
  /** A node added with its ports (the new values; there are no old ones). */
  | {
      readonly kind: "create-node";
      readonly node: NodeRecord;
      readonly ports: readonly PortRecord[];
    }
  /** Removed nodes with their ports and every connection the patch removes with them. */
  | {
      readonly kind: "delete";
      readonly nodes: readonly NodeRecord[];
      readonly ports: readonly PortRecord[];
      readonly connections: readonly ConnectionRecord[];
    }
  | { readonly kind: "connect"; readonly connection: ConnectionRecord }
  | { readonly kind: "disconnect"; readonly connection: ConnectionRecord }
  | ReconnectIntent
  /** Operations no other intent names, in patch order. */
  | { readonly kind: "other"; readonly ops: readonly PatchOp[] };

export type IntentKind = Intent["kind"];
