/** setPorts planner (PRT-01, PRT-02, PRT-03, PRT-07). */
import type { ConnectionId, PortId } from "../../base/ids/ids.js";
import type { PortRecord } from "../../data/model/records.js";
import { applyOp } from "../../data/patch/apply-ops.js";
import { valuesEqual } from "../../data/patch/equal.js";
import { createStagedState } from "../../data/patch/stage.js";
import type { PatchOp, PortFieldChanges } from "../../data/patch/types.js";
import { revalidate } from "../policy/validator.js";
import { portRecord } from "./create-node.js";
import {
  present,
  ready,
  rejected,
  rejectedWith,
  removeConnectionOp,
  removePortOp,
  unknownEntity,
} from "./ops.js";
import type { PlannerFor } from "./types.js";

const PORT_KEYS = [
  "direction",
  "typeKey",
  "limit",
  "label",
  "placement",
] as const;

function diff(old: PortRecord, next: PortRecord): PortFieldChanges {
  const fields: Record<string, { old?: unknown; new?: unknown }> = {};
  for (const key of PORT_KEYS) {
    const before = old[key];
    const after = next[key];
    if (valuesEqual(before, after)) continue;
    fields[key] = {
      ...(before === undefined ? {} : { old: before }),
      ...(after === undefined ? {} : { new: after }),
    };
  }
  return fields as PortFieldChanges;
}

/**
 * Entries with an `id` update that port, entries without one are added, and ports not
 * listed are removed. Connections on removed ports, and connections the policy no longer
 * accepts after a type or direction change, are removed or cause a rejection according
 * to `affected`; the plan's effects list them before anything is committed (PRT-07).
 */
export const planSetPorts: PlannerFor<"setPorts"> = (command, ctx) => {
  const { reader } = ctx;
  const node = reader.getNode(command.node);
  if (!node) return unknownEntity(command.node);

  const kept = new Set<PortId>();
  const next: PortRecord[] = [];
  const updates: PatchOp[] = [];
  const adds: PatchOp[] = [];
  for (const edit of command.ports) {
    if (edit.id === undefined) {
      const record = portRecord(ctx.ids.port(), node.id, edit);
      next.push(record);
      adds.push({ op: "add", entity: "port", record });
      continue;
    }
    const old = reader.getPort(edit.id);
    if (!old || old.node !== node.id) return unknownEntity(edit.id);
    if (kept.has(edit.id)) {
      return rejected("duplicate-id", `Port ${edit.id} is listed twice`, [
        edit.id,
      ]);
    }
    kept.add(edit.id);
    const record = portRecord(edit.id, node.id, edit);
    next.push(record);
    const fields = diff(old, record);
    if (Object.keys(fields).length > 0) {
      updates.push({ op: "update", entity: "port", id: edit.id, fields });
    }
  }
  const removedPorts = node.ports.filter((p) => !kept.has(p));
  const order = next.map((p) => p.id);
  const orderChanged = !valuesEqual(order, node.ports);
  const nodeOps: PatchOp[] = orderChanged
    ? [
        {
          op: "update",
          entity: "node",
          id: node.id,
          fields: { ports: { old: node.ports, new: order } },
        },
      ]
    : [];

  // Judge changed ports against the state as it will be after the edit.
  const stage = createStagedState(reader);
  for (const op of [...updates, ...adds, ...nodeOps]) {
    const refused = applyOp(stage, op);
    if (refused) return rejectedWith(refused);
  }
  const affected = new Set<ConnectionId>();
  for (const p of removedPorts) {
    for (const c of reader.connectionsOfPort(p)) affected.add(c.id);
  }
  for (const op of updates) {
    if (op.op !== "update" || op.entity !== "port") continue;
    if (!op.fields.typeKey && !op.fields.direction) continue;
    for (const c of reader.connectionsOfPort(op.id)) {
      if (revalidate(ctx.policy, stage, c)) affected.add(c.id);
    }
  }
  if (affected.size > 0 && command.affected === "reject") {
    return rejected(
      "conflict",
      `Port edit would affect ${affected.size} connection(s)`,
      [...affected],
    );
  }
  const ops: PatchOp[] = [
    ...present([...affected].map((id) => removeConnectionOp(reader, id))),
    ...present(removedPorts.map((id) => removePortOp(reader, id))),
    ...adds,
    ...updates,
    ...nodeOps,
  ];
  return ready("Edit ports", ops, ctx.ids);
};
