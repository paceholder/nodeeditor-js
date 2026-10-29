/**
 * Per-operation checks against a staged state (PAT-02).
 *
 * Each operation is validated and staged in order: an add must not collide with any
 * existing ID, a remove or update needs the entity and matching old values (otherwise
 * `conflict`), and every resulting record must pass structural validation.
 */
import type { ConnectionId, NodeId, PortId } from "../../base/ids/ids.js";
import { type Rejection, type Result, rejectionOf } from "../../base/result.js";
import type {
  ConnectionRecord,
  NodeRecord,
  PortRecord,
} from "../model/records.js";
import {
  validateConnectionRecord,
  validateNodeRecord,
  validatePortRecord,
} from "../model/validate-records.js";
import { valuesEqual } from "./equal.js";
import type { StagedState } from "./stage.js";
import type {
  ConnectionFieldChanges,
  NodeFieldChanges,
  PatchOp,
  PortFieldChanges,
} from "./types.js";

/** Mutable fields per kind; exhaustive, so a new record field must be listed here. */
const NODE_FIELDS: Record<keyof NodeFieldChanges, true> = {
  type: true,
  position: true,
  size: true,
  rotation: true,
  mirrored: true,
  z: true,
  ports: true,
  title: true,
  status: true,
  payload: true,
  capabilities: true,
};
const PORT_FIELDS: Record<keyof PortFieldChanges, true> = {
  direction: true,
  typeKey: true,
  limit: true,
  label: true,
  placement: true,
};
const CONNECTION_FIELDS: Record<keyof ConnectionFieldChanges, true> = {
  kind: true,
  from: true,
  to: true,
};

interface Kind<R extends { readonly id: string }> {
  readonly label: string;
  readonly fields: Readonly<Record<string, true>>;
  validate(input: unknown): Result<R, Rejection>;
  get(stage: StagedState, id: string): R | undefined;
  put(stage: StagedState, record: R, seq: number | undefined): void;
  drop(stage: StagedState, id: string): void;
}

const NODE: Kind<NodeRecord> = {
  label: "Node",
  fields: NODE_FIELDS,
  validate: validateNodeRecord,
  get: (s, id) => s.getNode(id as NodeId),
  put: (s, r, seq) => s.putNode(r, seq),
  drop: (s, id) => s.dropNode(id as NodeId),
};
const PORT: Kind<PortRecord> = {
  label: "Port",
  fields: PORT_FIELDS,
  validate: validatePortRecord,
  get: (s, id) => s.getPort(id as PortId),
  put: (s, r, seq) => s.putPort(r, seq),
  drop: (s, id) => s.dropPort(id as PortId),
};
const CONNECTION: Kind<ConnectionRecord> = {
  label: "Connection",
  fields: CONNECTION_FIELDS,
  validate: validateConnectionRecord,
  get: (s, id) => s.getConnection(id as ConnectionId),
  put: (s, r, seq) => s.putConnection(r, seq),
  drop: (s, id) => s.dropConnection(id as ConnectionId),
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSeq(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

function idInUse(stage: StagedState, id: string): boolean {
  return Boolean(
    stage.getNode(id as NodeId) ??
      stage.getPort(id as PortId) ??
      stage.getConnection(id as ConnectionId),
  );
}

function add<R extends { readonly id: string }>(
  kind: Kind<R>,
  stage: StagedState,
  input: R,
  seq: number | undefined,
): Rejection | undefined {
  const checked = kind.validate(input);
  if (!checked.ok) return checked.error;
  const id = checked.value.id;
  if (idInUse(stage, id)) {
    return rejectionOf("duplicate-id", `${kind.label} ${id} already exists`, [
      id,
    ]);
  }
  if (seq !== undefined && !isSeq(seq)) {
    return rejectionOf(
      "malformed-record",
      "Add seq must be a positive integer",
      [id],
    );
  }
  kind.put(stage, checked.value, seq);
  return undefined;
}

function remove<R extends { readonly id: string }>(
  kind: Kind<R>,
  stage: StagedState,
  record: R,
  seq: number,
): Rejection | undefined {
  const id = isObject(record) ? String(record.id) : "";
  const current = kind.get(stage, id);
  if (!current) {
    return rejectionOf("unknown-entity", `${kind.label} ${id} does not exist`, [
      id,
    ]);
  }
  const currentSeq = stage.seqOf(id as NodeId);
  if (currentSeq === undefined) {
    return rejectionOf(
      "malformed-record",
      `${kind.label} ${id} was added without seq in this patch and cannot be removed in it`,
      [id],
    );
  }
  if (currentSeq !== seq || !valuesEqual(current, record)) {
    return rejectionOf(
      "conflict",
      `${kind.label} ${id} changed since planned`,
      [id],
    );
  }
  kind.drop(stage, id);
  return undefined;
}

function update<R extends { readonly id: string }>(
  kind: Kind<R>,
  stage: StagedState,
  id: string,
  fields: unknown,
): Rejection | undefined {
  const current = kind.get(stage, id);
  if (!current) {
    return rejectionOf("unknown-entity", `${kind.label} ${id} does not exist`, [
      id,
    ]);
  }
  if (!isObject(fields)) {
    return rejectionOf("malformed-record", "Update fields must be an object", [
      id,
    ]);
  }
  const next: Record<string, unknown> = { ...current };
  for (const [key, change] of Object.entries(fields)) {
    if (!(key in kind.fields) || !isObject(change)) {
      return rejectionOf(
        "malformed-record",
        `${kind.label} field ${key} cannot be updated`,
        [id, key],
      );
    }
    if (!valuesEqual((current as Record<string, unknown>)[key], change.old)) {
      return rejectionOf(
        "conflict",
        `${kind.label} ${id} field ${key} differs from the expected old value`,
        [id, key],
      );
    }
    if (change.new === undefined) delete next[key];
    else next[key] = change.new;
  }
  const checked = kind.validate(next);
  if (!checked.ok) return checked.error;
  kind.put(stage, checked.value, stage.seqOf(id as NodeId));
  return undefined;
}

/** Validate and stage one operation. Returns a rejection, or undefined when staged. */
export function applyOp(
  stage: StagedState,
  op: PatchOp,
): Rejection | undefined {
  switch (op.op) {
    case "add":
      switch (op.entity) {
        case "node":
          return add(NODE, stage, op.record, op.seq);
        case "port":
          return add(PORT, stage, op.record, op.seq);
        case "connection":
          return add(CONNECTION, stage, op.record, op.seq);
      }
      break;
    case "remove":
      switch (op.entity) {
        case "node":
          return remove(NODE, stage, op.record, op.seq);
        case "port":
          return remove(PORT, stage, op.record, op.seq);
        case "connection":
          return remove(CONNECTION, stage, op.record, op.seq);
      }
      break;
    case "update":
      switch (op.entity) {
        case "node":
          return update(NODE, stage, op.id, op.fields);
        case "port":
          return update(PORT, stage, op.id, op.fields);
        case "connection":
          return update(CONNECTION, stage, op.id, op.fields);
      }
  }
  return rejectionOf("malformed-record", "Unknown patch operation");
}
