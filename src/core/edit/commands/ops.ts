/** Small patch-building helpers shared by planners. */
import type {
  ConnectionId,
  GroupId,
  NodeId,
  PortId,
} from "../../base/ids/ids.js";
import { type Rejection, rejectionOf } from "../../base/result.js";
import type { GraphReader } from "../../data/model/reader.js";
import type { Patch, PatchOp } from "../../data/patch/types.js";
import type { IdAllocator } from "./id-allocator.js";
import type { EntityIds, PlanEffects, PlanResult } from "./types.js";

export function rejected(
  code: Parameters<typeof rejectionOf>[0],
  message: string,
  entities: readonly string[] = [],
): PlanResult {
  return { kind: "rejected", rejection: rejectionOf(code, message, entities) };
}

export function rejectedWith(rejection: Rejection): PlanResult {
  return { kind: "rejected", rejection };
}

export function unknownEntity(id: string): PlanResult {
  return rejected("unknown-entity", `${id} does not exist`, [id]);
}

function bucket(): {
  nodes: NodeId[];
  ports: PortId[];
  connections: ConnectionId[];
  groups: GroupId[];
} {
  return { nodes: [], ports: [], connections: [], groups: [] };
}

function put(into: ReturnType<typeof bucket>, op: PatchOp): void {
  const id = op.op === "update" ? op.id : op.record.id;
  if (op.entity === "node") into.nodes.push(id as NodeId);
  else if (op.entity === "port") into.ports.push(id as PortId);
  else if (op.entity === "connection")
    into.connections.push(id as ConnectionId);
  else into.groups.push(id as GroupId);
}

/** Summarize a patch: adds are created, removes removed, updates updated. */
export function effectsOf(ops: readonly PatchOp[]): PlanEffects {
  const created = bucket();
  const removed = bucket();
  const updated = bucket();
  for (const op of ops) {
    put(op.op === "add" ? created : op.op === "remove" ? removed : updated, op);
  }
  const freeze = (b: ReturnType<typeof bucket>): EntityIds => b;
  return {
    created: freeze(created),
    removed: freeze(removed),
    updated: freeze(updated),
  };
}

/** A ready plan whose patch carries the cursor of any IDs the planner allocated. */
export function ready(
  label: string,
  ops: readonly PatchOp[],
  ids: IdAllocator,
): PlanResult {
  const cursor = ids.cursor();
  const patch: Patch = cursor ? { ops, idCursor: cursor } : { ops };
  return { kind: "ready", patch, label, effects: effectsOf(ops) };
}

export function removeNodeOp(
  reader: GraphReader,
  id: NodeId,
): PatchOp | undefined {
  const record = reader.getNode(id);
  const seq = reader.seqOf(id);
  return record && seq !== undefined
    ? { op: "remove", entity: "node", record, seq }
    : undefined;
}

export function removePortOp(
  reader: GraphReader,
  id: PortId,
): PatchOp | undefined {
  const record = reader.getPort(id);
  const seq = reader.seqOf(id);
  return record && seq !== undefined
    ? { op: "remove", entity: "port", record, seq }
    : undefined;
}

export function removeConnectionOp(
  reader: GraphReader,
  id: ConnectionId,
): PatchOp | undefined {
  const record = reader.getConnection(id);
  const seq = reader.seqOf(id);
  return record && seq !== undefined
    ? { op: "remove", entity: "connection", record, seq }
    : undefined;
}

export function removeGroupOp(
  reader: GraphReader,
  id: GroupId,
): PatchOp | undefined {
  const record = reader.getGroup(id);
  const seq = reader.seqOf(id);
  return record && seq !== undefined
    ? { op: "remove", entity: "group", record, seq }
    : undefined;
}

/** Defined entries of a list of optional ops. */
export function present(ops: readonly (PatchOp | undefined)[]): PatchOp[] {
  return ops.flatMap((o) => (o ? [o] : []));
}
