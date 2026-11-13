/**
 * Membership changes shared by the group planners, `moveNodes` and `deleteEntities`.
 *
 * Callers say which group each node should end up in; this builds the node updates and
 * removes every group the change leaves without members, so the result always satisfies
 * the rule that a group has at least one member.
 */
import type { GroupId, NodeId } from "../../base/ids/ids.js";
import type { GraphReader } from "../../data/model/reader.js";
import type { PatchOp } from "../../data/patch/types.js";
import { present, rejected, removeGroupOp } from "./ops.js";
import type { PlanResult } from "./types.js";

export interface MembershipChange {
  /** Target group of each node; `undefined` frees the node. */
  readonly targets: ReadonlyMap<NodeId, GroupId | undefined>;
  /** Nodes the same patch deletes; they leave their groups without an update. */
  readonly deleted?: ReadonlySet<NodeId>;
  /** Groups to remove whatever members they keep; those members are freed. */
  readonly dissolved?: ReadonlySet<GroupId>;
}

/** Node updates first, then removals of dissolved and emptied groups, in group order. */
export function membershipOps(
  reader: GraphReader,
  change: MembershipChange,
): PatchOp[] {
  const targets = new Map(change.targets);
  for (const group of change.dissolved ?? []) {
    for (const member of reader.groupMembers(group))
      if (!change.deleted?.has(member.id)) targets.set(member.id, undefined);
  }
  const ops: PatchOp[] = [];
  const lost = new Map<GroupId, number>();
  const gained = new Set<GroupId>();
  const leave = (group: GroupId | undefined) => {
    if (group !== undefined) lost.set(group, (lost.get(group) ?? 0) + 1);
  };
  for (const id of change.deleted ?? []) leave(reader.getNode(id)?.group);
  for (const [id, to] of targets) {
    const node = reader.getNode(id);
    if (!node || node.group === to || change.deleted?.has(id)) continue;
    leave(node.group);
    if (to !== undefined) gained.add(to);
    ops.push({
      op: "update",
      entity: "node",
      id,
      fields: {
        group: {
          ...(node.group === undefined ? {} : { old: node.group }),
          ...(to === undefined ? {} : { new: to }),
        },
      },
    });
  }
  const gone = new Set<GroupId>(change.dissolved ?? []);
  for (const [group, count] of lost) {
    if (!gained.has(group) && reader.groupMembers(group).length === count)
      gone.add(group);
  }
  const ordered = [...gone].sort(
    (a, b) => (reader.seqOf(a) ?? 0) - (reader.seqOf(b) ?? 0),
  );
  return [...ops, ...present(ordered.map((id) => removeGroupOp(reader, id)))];
}

/**
 * The rejection for a membership change that touches a locked group, if any: a node
 * may neither leave a locked group nor join one.
 */
export function lockedMembership(
  reader: GraphReader,
  targets: ReadonlyMap<NodeId, GroupId | undefined>,
): PlanResult | undefined {
  for (const [id, to] of targets) {
    const from = reader.getNode(id)?.group;
    if (from === to) continue;
    for (const group of [from, to]) {
      if (group !== undefined && reader.getGroup(group)?.locked)
        return groupLocked(group);
    }
  }
  return undefined;
}

export function groupLocked(group: GroupId): PlanResult {
  return rejected("group-locked", `Group ${group} is locked`, [group]);
}
