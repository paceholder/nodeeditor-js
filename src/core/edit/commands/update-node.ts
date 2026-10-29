/** updateNode planner (NOD-05 model side): title, status and payload edits. */

import { valuesEqual } from "../../data/patch/equal.js";
import type { NodeFieldChanges, PatchOp } from "../../data/patch/types.js";
import { ready, unknownEntity } from "./ops.js";
import type { PlannerFor } from "./types.js";

export const planUpdateNode: PlannerFor<"updateNode"> = (command, ctx) => {
  const node = ctx.reader.getNode(command.node);
  if (!node) return unknownEntity(command.node);
  const change = <V>(old: V | undefined, next: V | undefined) =>
    next === undefined || valuesEqual(old, next)
      ? undefined
      : {
          ...(old === undefined ? {} : { old }),
          new: next,
        };
  const title = change(node.title, command.title);
  const status = change(node.status, command.status);
  const payload = change(node.payload, command.payload);
  const fields: NodeFieldChanges = {
    ...(title ? { title } : {}),
    ...(status ? { status } : {}),
    ...(payload ? { payload } : {}),
  };
  const ops: PatchOp[] =
    Object.keys(fields).length === 0
      ? []
      : [{ op: "update", entity: "node", id: node.id, fields }];
  return ready("Edit node", ops, ctx.ids);
};
