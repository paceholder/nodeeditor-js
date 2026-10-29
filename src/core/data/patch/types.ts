/**
 * Patch format.
 *
 * A patch is plain JSON-compatible data: an ordered list of add, remove and update
 * operations on nodes, ports and connections. Updates carry the old and new value of every
 * changed field. Removes carry the full record and its collection order key (`seq`), so an
 * inverse restores the exact prior state including order.
 *
 * Absent keys mean "field absent": a `FieldChange` without `old` expects the field to be
 * missing, and one without `new` removes it.
 */

import type { IdCursor } from "../../base/ids/id-generator.js";
import type { ConnectionId, NodeId, PortId } from "../../base/ids/ids.js";
import type {
  ConnectionRecord,
  NodeRecord,
  PortRecord,
} from "../model/records.js";

export type EntityKind = "node" | "port" | "connection";

/** Old and new value of one field. A missing key means the field is absent. */
export interface FieldChange<V> {
  readonly old?: V;
  readonly new?: V;
}

type Changes<R> = { readonly [K in keyof R]?: FieldChange<Required<R>[K]> };

/** `id` never changes. */
export type NodeFieldChanges = Changes<Omit<NodeRecord, "id">>;
/** `id` and the owning `node` never change. */
export type PortFieldChanges = Changes<Omit<PortRecord, "id" | "node">>;
/** Endpoints may change; the ID stays. */
export type ConnectionFieldChanges = Changes<Omit<ConnectionRecord, "id">>;

export type PatchOp =
  | {
      readonly op: "add";
      readonly entity: "node";
      readonly record: NodeRecord;
      readonly seq?: number;
    }
  | {
      readonly op: "add";
      readonly entity: "port";
      readonly record: PortRecord;
      readonly seq?: number;
    }
  | {
      readonly op: "add";
      readonly entity: "connection";
      readonly record: ConnectionRecord;
      readonly seq?: number;
    }
  | {
      readonly op: "remove";
      readonly entity: "node";
      readonly record: NodeRecord;
      readonly seq: number;
    }
  | {
      readonly op: "remove";
      readonly entity: "port";
      readonly record: PortRecord;
      readonly seq: number;
    }
  | {
      readonly op: "remove";
      readonly entity: "connection";
      readonly record: ConnectionRecord;
      readonly seq: number;
    }
  | {
      readonly op: "update";
      readonly entity: "node";
      readonly id: NodeId;
      readonly fields: NodeFieldChanges;
    }
  | {
      readonly op: "update";
      readonly entity: "port";
      readonly id: PortId;
      readonly fields: PortFieldChanges;
    }
  | {
      readonly op: "update";
      readonly entity: "connection";
      readonly id: ConnectionId;
      readonly fields: ConnectionFieldChanges;
    };

export interface Patch {
  readonly ops: readonly PatchOp[];
  /** New ID generator cursor. Only ever moves the model's cursor forward. */
  readonly idCursor?: IdCursor;
}

/** Where a change came from. Only `local` edits enter local undo history. */
export type ChangeOrigin = "local" | "undo" | "redo" | "external";

/** IDs touched by a patch, in first-touched order, without duplicates. */
export interface ChangedIds {
  readonly nodes: readonly NodeId[];
  readonly ports: readonly PortId[];
  readonly connections: readonly ConnectionId[];
}

/** A committed patch: every add carries the `seq` it was given, so it can be inverted. */
export interface AppliedPatch {
  readonly patch: Patch;
  readonly changed: ChangedIds;
  /** Store revision after the commit. */
  readonly revision: number;
}
