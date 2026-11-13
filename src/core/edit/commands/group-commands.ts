/**
 * Group planners: groupNodes, ungroup, addToGroup, removeFromGroup, renameGroup and
 * setGroupLocked. Moving a group is a `moveNodes` over its members.
 */
import type { GroupId, NodeId } from "../../base/ids/ids.js";
import type { GroupRecord } from "../../data/model/records.js";
import { validateGroupRecord } from "../../data/model/validate-group.js";
import type { PatchOp } from "../../data/patch/types.js";
import { lockedMembership, membershipOps } from "./group-membership.js";
import { ready, rejected, rejectedWith, unknownEntity } from "./ops.js";
import type { PlanContext, PlannerFor, PlanResult } from "./types.js";

/** Title of a group created without one. Hosts pass their own for other languages. */
export const DEFAULT_GROUP_TITLE = "Group";

function missingNode(
  ctx: PlanContext,
  nodes: readonly NodeId[],
): PlanResult | undefined {
  for (const id of nodes) if (!ctx.reader.getNode(id)) return unknownEntity(id);
  return undefined;
}

export const planGroupNodes: PlannerFor<"groupNodes"> = (command, ctx) => {
  const nodes = [...new Set(command.nodes)];
  if (nodes.length === 0)
    return rejected("nothing-to-do", "There are no nodes to group");
  const bad = missingNode(ctx, nodes);
  if (bad) return bad;
  const id = ctx.ids.group();
  const checked = validateGroupRecord({
    id,
    title: command.title ?? DEFAULT_GROUP_TITLE,
    locked: false,
    ...(command.style === undefined ? {} : { style: command.style }),
  });
  if (!checked.ok) return rejectedWith(checked.rejection);
  const targets = new Map<NodeId, GroupId | undefined>(
    nodes.map((n) => [n, id]),
  );
  const locked = lockedMembership(ctx.reader, targets);
  if (locked) return locked;
  return ready(
    "Group",
    [
      { op: "add", entity: "group", record: checked.value },
      ...membershipOps(ctx.reader, { targets }),
    ],
    ctx.ids,
  );
};

export const planUngroup: PlannerFor<"ungroup"> = (command, ctx) => {
  const groups = new Set(command.groups);
  if (groups.size === 0)
    return rejected("nothing-to-do", "There are no groups to ungroup");
  for (const id of groups)
    if (!ctx.reader.getGroup(id)) return unknownEntity(id);
  return ready(
    "Ungroup",
    membershipOps(ctx.reader, { targets: new Map(), dissolved: groups }),
    ctx.ids,
  );
};

export const planAddToGroup: PlannerFor<"addToGroup"> = (command, ctx) => {
  if (!ctx.reader.getGroup(command.group)) return unknownEntity(command.group);
  const bad = missingNode(ctx, command.nodes);
  if (bad) return bad;
  const targets = new Map<NodeId, GroupId | undefined>(
    command.nodes.map((n) => [n, command.group]),
  );
  const locked = lockedMembership(ctx.reader, targets);
  if (locked) return locked;
  return ready("Add to group", membershipOps(ctx.reader, { targets }), ctx.ids);
};

export const planRemoveFromGroup: PlannerFor<"removeFromGroup"> = (
  command,
  ctx,
) => {
  const bad = missingNode(ctx, command.nodes);
  if (bad) return bad;
  const targets = new Map<NodeId, GroupId | undefined>(
    command.nodes.map((n) => [n, undefined]),
  );
  const locked = lockedMembership(ctx.reader, targets);
  if (locked) return locked;
  return ready(
    "Remove from group",
    membershipOps(ctx.reader, { targets }),
    ctx.ids,
  );
};

function updateGroup(
  ctx: PlanContext,
  id: GroupId,
  label: string,
  next: (group: GroupRecord) => GroupRecord,
): PlanResult {
  const group = ctx.reader.getGroup(id);
  if (!group) return unknownEntity(id);
  const checked = validateGroupRecord(next(group));
  if (!checked.ok) return rejectedWith(checked.rejection);
  const { title, locked } = checked.value;
  const ops: PatchOp[] =
    title === group.title && locked === group.locked
      ? []
      : [
          {
            op: "update",
            entity: "group",
            id,
            fields: {
              ...(title === group.title
                ? {}
                : { title: { old: group.title, new: title } }),
              ...(locked === group.locked
                ? {}
                : { locked: { old: group.locked, new: locked } }),
            },
          },
        ];
  return ready(label, ops, ctx.ids);
}

export const planRenameGroup: PlannerFor<"renameGroup"> = (command, ctx) =>
  updateGroup(ctx, command.group, "Rename group", (g) => ({
    ...g,
    title: command.title,
  }));

export const planSetGroupLocked: PlannerFor<"setGroupLocked"> = (
  command,
  ctx,
) =>
  updateGroup(
    ctx,
    command.group,
    command.locked ? "Lock group" : "Unlock group",
    (g) => ({ ...g, locked: command.locked }),
  );
