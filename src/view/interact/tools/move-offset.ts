/** Move math for the select/move tool: drag offset, grid snapping, capability split. */
import type { NodeId, Point, Vec2 } from "../../../core/index.js";
import type { ToolContext } from "./tool-types.js";

export interface MoveOrigin {
  readonly id: NodeId;
  readonly position: Vec2;
}

/**
 * Offset to apply to every moved node. With snapping on and Alt not held, the anchor
 * node's new position lands on the grid and the others follow by the same offset, which
 * preserves their relative positions (D6).
 */
export function dragOffset(
  start: Point<"world">,
  current: Point<"world">,
  anchor: MoveOrigin | undefined,
  gridStep: number | undefined,
  suppressSnap: boolean,
): Vec2 {
  const raw = { x: current.x - start.x, y: current.y - start.y };
  if (!anchor || gridStep === undefined || gridStep <= 0 || suppressSnap) {
    return raw;
  }
  const snap = (v: number): number => Math.round(v / gridStep) * gridStep;
  return {
    x: snap(anchor.position.x + raw.x) - anchor.position.x,
    y: snap(anchor.position.y + raw.y) - anchor.position.y,
  };
}

export interface MovePartition {
  readonly movable: readonly MoveOrigin[];
  /** Selected nodes a capability keeps in place. */
  readonly locked: readonly NodeId[];
}

export function partitionMovable(
  ids: readonly NodeId[],
  ctx: ToolContext,
): MovePartition {
  const movable: MoveOrigin[] = [];
  const locked: NodeId[] = [];
  for (const id of ids) {
    const node = ctx.reader.getNode(id);
    if (!node) continue;
    if (ctx.can("move", id).available) {
      movable.push({ id, position: node.position });
    } else {
      locked.push(id);
    }
  }
  return { movable, locked };
}
