/**
 * Which nodes an edit of the selection concerns once groups are taken into account.
 * Shared by the drag, the keyboard move and the clipboard, so they cannot disagree.
 */
import {
  type Command,
  type GraphReader,
  type GroupId,
  groupId,
  type NodeId,
  nodeId,
} from "../../../core/index.js";
import type { ReadonlySelection, SelectionKey } from "./selection-model.js";

type Groups = Pick<GraphReader, "getNode" | "getGroup" | "groupMembers">;

/** The selected nodes plus every member of the selected groups, without duplicates. */
export function nodesWithGroupMembers(
  keys: readonly SelectionKey[],
  reader: Groups,
): NodeId[] {
  const ids = new Set<NodeId>();
  for (const key of keys) {
    if (key.startsWith("n:")) ids.add(nodeId(key.slice(2)));
    else if (key.startsWith("g:")) {
      for (const member of reader.groupMembers(groupId(key.slice(2))))
        ids.add(member.id);
    }
  }
  return [...ids];
}

/**
 * The nodes a move of the selection moves: the selected nodes, the members of the
 * selected groups, and, for each of those in a locked group, the rest of that group,
 * since a locked group moves only as a whole.
 */
export function nodesToMove(
  keys: readonly SelectionKey[],
  reader: Groups,
): NodeId[] {
  const ids = new Set<NodeId>(nodesWithGroupMembers(keys, reader));
  const whole = new Set<GroupId>();
  for (const id of ids) {
    const group = reader.getNode(id)?.group;
    if (group !== undefined && reader.getGroup(group)?.locked) whole.add(group);
  }
  for (const group of whole)
    for (const member of reader.groupMembers(group)) ids.add(member.id);
  return [...ids];
}

/**
 * The delete half of a cut. A copied group travels with all its members, so cutting it
 * removes those members too, unlike a plain delete of a selected group, which removes
 * only the frame.
 */
export function cutCommand(
  selection: ReadonlySelection,
  reader: Groups,
): Command {
  const groups = selection.groupIds();
  return {
    kind: "deleteEntities",
    nodes: nodesWithGroupMembers(selection.keys(), reader),
    connections: selection.connectionIds(),
    ...(groups.length > 0 ? { groups } : {}),
  };
}
