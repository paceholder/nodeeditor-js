/**
 * What a move does to group membership and to group frames.
 *
 * Both tests use the frames as they are when the gesture starts (the scene is not
 * changed during a drag), so a frame cannot grow to keep hold of the node being dragged
 * away, and a short move inside the frame changes nothing:
 *
 * - a moved member whose body no longer overlaps its group's frame leaves;
 * - a moved node that is then free and overlaps the frame of another group joins it, the
 *   one under the pointer first, else the first in document order.
 *
 * A group whose members all move keeps them all and takes nobody: it has nothing left
 * to stay with or to join. A locked group accepts and releases nobody. Pure and DOM-free.
 */
import {
  type GroupId,
  type NodeId,
  type Point,
  type Rect,
  rectContainsPoint,
  rectsIntersect,
  type Vec2,
} from "../../../core/index.js";
import type { GroupFramePreview } from "../../render/paint/previews/preview-types.js";
import type { ToolContext } from "./tool-types.js";

export interface GroupDrop {
  /** Membership changes the drop makes; `null` frees the node. Empty: none. */
  readonly membership: readonly {
    readonly node: NodeId;
    readonly group: GroupId | null;
  }[];
  /** Frames of every group a moved node belongs to, leaves or joins, as after the drop. */
  readonly frames: readonly GroupFramePreview[];
}

const NOTHING: GroupDrop = { membership: [], frames: [] };

export function groupDrop(
  ctx: Pick<ToolContext, "reader" | "scene">,
  moved: readonly NodeId[],
  offset: Vec2,
  pointer: Point<"world">,
  /** False: membership never changes; the frames still follow their members. */
  dragMembership: boolean,
): GroupDrop {
  const groups = ctx.scene.groups();
  if (groups.length === 0) return NOTHING;
  const movedSet = new Set<NodeId>(moved);
  const boundsOf = (id: NodeId): Rect<"world"> | undefined => {
    const b = ctx.scene.node(id)?.bodyBounds;
    if (!b) return undefined;
    return movedSet.has(id)
      ? { ...b, x: b.x + offset.x, y: b.y + offset.y }
      : b;
  };
  /** Start frame of each group that may take or release nodes, in document order. */
  const open = new Map<GroupId, Rect<"world">>();
  if (dragMembership) {
    for (const g of groups) {
      if (g.record.locked || g.members.every((m) => movedSet.has(m))) continue;
      open.set(g.id, g.frame);
    }
  }

  const final = new Map<NodeId, GroupId | undefined>();
  const membership: { node: NodeId; group: GroupId | null }[] = [];
  for (const id of moved) {
    const current = ctx.reader.getNode(id)?.group;
    const bounds = boundsOf(id);
    let target = current;
    if (bounds && current !== undefined) {
      const frame = open.get(current);
      if (frame && !rectsIntersect(bounds, frame)) target = undefined;
    }
    if (bounds && target === undefined) {
      let first: GroupId | undefined;
      for (const [group, frame] of open) {
        if (group === current || !rectsIntersect(bounds, frame)) continue;
        first ??= group;
        if (rectContainsPoint(frame, pointer)) {
          first = group;
          break;
        }
      }
      target = first;
    }
    final.set(id, target);
    if (target !== current)
      membership.push({ node: id, group: target ?? null });
  }

  const frames: GroupFramePreview[] = [];
  for (const g of groups) {
    const kept = g.members.filter(
      (m) => !final.has(m) || final.get(m) === g.id,
    );
    const joined = moved.filter(
      (m) => final.get(m) === g.id && !g.members.includes(m),
    );
    const touched = joined.length > 0 || g.members.some((m) => movedSet.has(m));
    if (!touched) continue;
    frames.push({
      group: g.id,
      members: [...kept, ...joined],
      joining: joined.length > 0,
    });
  }
  return { membership, frames };
}
