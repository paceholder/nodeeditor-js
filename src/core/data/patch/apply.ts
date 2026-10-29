/**
 * Atomic patch application (PAT-02, MOD-05).
 *
 * Pipeline: stage every operation, check reference integrity, run validators, then commit
 * the staged result in one store batch. Everything before the commit leaves the store
 * untouched, so any rejection means "nothing changed". The store itself neither validates
 * nor rolls back, which is why all checks happen first.
 */
import type { ConnectionId, NodeId, PortId } from "../../base/ids/ids.js";
import {
  err,
  ok,
  type Rejection,
  type Result,
  reject,
} from "../../base/result.js";
import type { GraphReader } from "../model/reader.js";
import type { GraphStore } from "../model/store.js";
import { applyOp } from "./apply-ops.js";
import { checkIntegrity } from "./integrity.js";
import { createStagedState, type StagedWrite } from "./stage.js";
import type {
  AppliedPatch,
  ChangedIds,
  ChangeOrigin,
  Patch,
  PatchOp,
} from "./types.js";
import type { PatchValidator } from "./validator.js";

export interface ApplyContext {
  readonly origin: ChangeOrigin;
  readonly operationId: string;
}

/** Changed IDs: touched entities plus the nodes at both ends of touched connections. */
export function changedIds(ops: readonly PatchOp[]): ChangedIds {
  const nodes = new Set<NodeId>();
  const ports = new Set<PortId>();
  const connections = new Set<ConnectionId>();
  for (const op of ops) {
    const id = op.op === "update" ? op.id : op.record.id;
    if (op.entity === "node") nodes.add(id as NodeId);
    else if (op.entity === "port") ports.add(id as PortId);
    else {
      connections.add(id as ConnectionId);
      const ends =
        op.op === "update"
          ? [
              op.fields.from?.old,
              op.fields.from?.new,
              op.fields.to?.old,
              op.fields.to?.new,
            ]
          : [op.record.from, op.record.to];
      for (const end of ends) if (end) nodes.add(end.node);
    }
  }
  return {
    nodes: [...nodes],
    ports: [...ports],
    connections: [...connections],
  };
}

function commit(
  store: GraphStore,
  writes: readonly StagedWrite[],
): ReadonlyMap<string, number> {
  const assigned = new Map<string, number>();
  const baseSeq = (w: StagedWrite): number | undefined =>
    w.kind === "node"
      ? store.nodes.seqOf(w.id)
      : w.kind === "port"
        ? store.ports.seqOf(w.id)
        : store.connections.seqOf(w.id);
  store.batch((tx) => {
    for (const w of writes) {
      const current = baseSeq(w);
      if (current === undefined) continue;
      // An explicit different seq means the entity is re-added: drop it first.
      if (w.record !== undefined && (w.seq === undefined || w.seq === current))
        continue;
      if (w.kind === "node") tx.removeNode(w.id);
      else if (w.kind === "port") tx.removePort(w.id);
      else tx.removeConnection(w.id);
    }
    for (const w of writes) {
      if (w.record === undefined) continue;
      const options = w.seq === undefined ? undefined : { seq: w.seq };
      const seq =
        w.kind === "node"
          ? tx.putNode(w.record, options)
          : w.kind === "port"
            ? tx.putPort(w.record, options)
            : tx.putConnection(w.record, options);
      assigned.set(w.id, seq);
    }
  });
  return assigned;
}

/**
 * Validate and apply `patch`. On success the returned patch has `seq` filled in on every
 * add; on failure the store is unchanged.
 */
export function applyPatch(
  store: GraphStore,
  reader: GraphReader,
  patch: Patch,
  validators: readonly PatchValidator[],
  context: ApplyContext,
): Result<AppliedPatch, Rejection> {
  if (!Array.isArray(patch.ops)) {
    return reject("malformed-record", "Patch ops must be an array");
  }
  const stage = createStagedState(reader);
  for (const op of patch.ops) {
    const rejection = applyOp(stage, op);
    if (rejection) return err(rejection);
  }
  const broken = checkIntegrity(stage, patch.ops);
  if (broken) return err(broken);
  for (const validator of validators) {
    const refused = validator.validate(stage, patch, context);
    if (refused) return err(refused);
  }
  const assigned = commit(store, stage.writes());
  const ops = patch.ops.map((op): PatchOp => {
    if (op.op !== "add" || op.seq !== undefined) return op;
    const seq = assigned.get(op.record.id);
    return seq === undefined ? op : { ...op, seq };
  });
  const applied: Patch =
    patch.idCursor === undefined ? { ops } : { ops, idCursor: patch.idCursor };
  return ok({
    patch: applied,
    changed: changedIds(ops),
    revision: store.revision(),
  });
}
