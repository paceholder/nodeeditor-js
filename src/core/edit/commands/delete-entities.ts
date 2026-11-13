/** deleteEntities planner. */
import type { ConnectionId, GroupId, NodeId } from "../../base/ids/ids.js";
import type { PatchOp } from "../../data/patch/types.js";
import { membershipOps } from "./group-membership.js";
import {
  present,
  ready,
  removeConnectionOp,
  removeNodeOp,
  removePortOp,
  unknownEntity,
} from "./ops.js";
import type { PlannerFor } from "./types.js";

/**
 * Removes the listed connections, then the incident connections of each listed node,
 * then each node followed by its ports, all in one patch. A listed group is removed
 * and its surviving members become free; a group whose members are all deleted goes with
 * them. Capability protection is
 * checked at commit and by `plan()`, which rejects the whole command (Slice B adds
 * allowed-subset plans).
 */
export const planDeleteEntities: PlannerFor<"deleteEntities"> = (
  command,
  ctx,
) => {
  const { reader } = ctx;
  const nodes: NodeId[] = [...new Set(command.nodes ?? [])];
  const listed: ConnectionId[] = [...new Set(command.connections ?? [])];
  for (const id of nodes) if (!reader.getNode(id)) return unknownEntity(id);
  for (const id of listed)
    if (!reader.getConnection(id)) return unknownEntity(id);
  const groups = new Set<GroupId>(command.groups ?? []);
  for (const id of groups) if (!reader.getGroup(id)) return unknownEntity(id);

  const connections = new Set<ConnectionId>(listed);
  for (const id of nodes) {
    for (const c of reader.connectionsOfNode(id)) connections.add(c.id);
  }
  const ops: PatchOp[] = present([
    ...[...connections].map((id) => removeConnectionOp(reader, id)),
    ...nodes.flatMap((id) => [
      removeNodeOp(reader, id),
      ...(reader.getNode(id)?.ports ?? []).map((p) => removePortOp(reader, p)),
    ]),
  ]);
  ops.push(
    ...membershipOps(reader, {
      targets: new Map(),
      deleted: new Set(nodes),
      dissolved: groups,
    }),
  );
  const label =
    nodes.length > 0
      ? "Delete"
      : listed.length > 0
        ? "Delete connection"
        : "Ungroup";
  return ready(label, ops, ctx.ids);
};
