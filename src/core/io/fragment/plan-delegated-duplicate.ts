/**
 * Duplicate when the host names nodes: one duplicate intent carrying IDs.
 *
 * The host already holds every record to copy, so nothing is extracted, encoded or
 * validated as a fragment: the planner checks that the nodes and groups exist and that
 * the node types may be created, then lists the node IDs in paint order, the groups to
 * copy, the connections the copy re-creates, and the offset a local duplicate would add.
 * As in a local duplicate, a listed group brings all its members, and a copied node joins
 * the copy of its group only when that group is listed; otherwise the copy is free. The connections are the ones a
 * local duplicate copies: those between two listed nodes, plus, only when the command
 * preserves external connections, those with one end on a listed node. Under the default
 * the latter are reported as excluded. Payload codecs and fragment limits do not apply,
 * since nothing is encoded and the IDs come from the read model.
 */
import type {
  ConnectionId,
  GroupId,
  NodeId,
  OperationId,
} from "../../base/ids/ids.js";
import type { GraphReader } from "../../data/model/reader.js";
import type {
  ConnectionRecord,
  GroupRecord,
  NodeRecord,
} from "../../data/model/records.js";
import type { Vec2 } from "../../data/model/values.js";
import { rejected, unknownEntity } from "../../edit/commands/ops.js";
import type {
  Command,
  ExcludedReference,
  Placement,
  PlanContext,
  PlanResult,
} from "../../edit/commands/types.js";
import { boundsCentre, fragmentBounds } from "./bounds.js";
import { checkTypes } from "./check-types.js";

const seq =
  (reader: GraphReader) =>
  (a: { id: NodeId | ConnectionId }, b: { id: NodeId | ConnectionId }) =>
    (reader.seqOf(a.id) ?? 0) - (reader.seqOf(b.id) ?? 0);

/** The offset a local duplicate adds: `by`, or what centres the nodes' frames on `at`. */
function offsetOf(placement: Placement, nodes: readonly NodeRecord[]): Vec2 {
  if (placement.kind === "offset") return placement.by;
  const bounds = fragmentBounds(nodes);
  if (!bounds) return { x: 0, y: 0 };
  const centre = boundsCentre(bounds);
  return { x: placement.at.x - centre.x, y: placement.at.y - centre.y };
}

export function planDelegatedDuplicate(
  command: Extract<Command, { kind: "duplicate" }>,
  ctx: PlanContext,
  operationId: () => OperationId,
): PlanResult {
  const { reader } = ctx;
  const nodes: NodeRecord[] = [];
  const inSet = new Set<NodeId>();
  for (const id of command.nodes) {
    const node = reader.getNode(id);
    if (!node) return unknownEntity(id);
    if (!inSet.has(id)) nodes.push(node);
    inSet.add(id);
  }
  const groups: GroupRecord[] = [];
  for (const id of new Set(command.groups ?? [])) {
    const group = reader.getGroup(id);
    if (!group) return unknownEntity(id);
    groups.push(group);
    for (const member of reader.groupMembers(id)) {
      if (!inSet.has(member.id)) nodes.push(member);
      inSet.add(member.id);
    }
  }
  if (nodes.length === 0) {
    return rejected("empty-fragment", "Select at least one node to copy");
  }
  const wrongType = checkTypes(nodes, ctx);
  if (wrongType) return wrongType;
  // Paint order is (z, seq) ascending, as in a copied fragment.
  const order = seq(reader);
  nodes.sort((a, b) => a.z - b.z || order(a, b));
  // Creation order, as in a copied fragment.
  const groupIds: GroupId[] = groups
    .sort((a, b) => (reader.seqOf(a.id) ?? 0) - (reader.seqOf(b.id) ?? 0))
    .map((g) => g.id);

  // Read by key only; the output order comes from the sort.
  const touched = new Map<ConnectionId, ConnectionRecord>();
  for (const node of nodes) {
    for (const c of reader.connectionsOfNode(node.id)) touched.set(c.id, c);
  }
  const preserve = command.external === "preserve";
  const connections: ConnectionId[] = [];
  const excluded: ExcludedReference[] = [];
  for (const c of [...touched.values()].sort(order)) {
    const internal = inSet.has(c.from.node) && inSet.has(c.to.node);
    if (internal || preserve) connections.push(c.id);
    else excluded.push({ connection: c.id, reason: "external" });
  }
  return {
    kind: "delegated",
    label: "Duplicate",
    intent: {
      kind: "duplicate",
      operationId: operationId(),
      nodes: nodes.map((n) => n.id),
      connections,
      ...(groupIds.length > 0 ? { groups: groupIds } : {}),
      offset: offsetOf(command.placement, nodes),
    },
    excluded,
  };
}
