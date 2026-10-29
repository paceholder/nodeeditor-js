/** Patch builders shared by model-level tests. They allocate IDs through the model. */
import { nodeId, portId } from "../../base/ids/ids.js";
import type { GraphModel } from "../../graph-model.js";
import type { Patch, PatchOp } from "../patch/types.js";
import { mkNode, mkPort } from "./test-helpers.js";

/** Plan a node with one port, allocating IDs from the model's cursor. */
export function planNode(model: GraphModel): {
  readonly patch: Patch;
  readonly node: ReturnType<typeof nodeId>;
  readonly port: ReturnType<typeof portId>;
} {
  const n = model.idGenerator.next("node", model.idCursor());
  const p = model.idGenerator.next("port", n.cursor);
  const node = nodeId(n.id);
  const port = portId(p.id);
  const ops: PatchOp[] = [
    { op: "add", entity: "node", record: mkNode(n.id, { ports: [port] }) },
    { op: "add", entity: "port", record: mkPort(p.id, n.id) },
  ];
  return { patch: { ops, idCursor: p.cursor }, node, port };
}

export function moveOp(
  id: ReturnType<typeof nodeId>,
  from: { x: number; y: number },
  to: { x: number; y: number },
): PatchOp {
  return {
    op: "update",
    entity: "node",
    id,
    fields: { position: { old: from, new: to } },
  };
}
