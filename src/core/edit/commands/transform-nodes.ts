/** moveNodes, rotateNodes, mirrorNodes, reorderNodes planners. */
import type { NodeId } from "../../base/ids/ids.js";
import { mirroredRotation } from "../../data/model/node-frame.js";
import { translateConstraints } from "../../data/model/route-constraints.js";
import type { QuarterTurns, Vec2 } from "../../data/model/values.js";
import type { PatchOp } from "../../data/patch/types.js";
import { ready, unknownEntity } from "./ops.js";
import type { PlanContext, PlannerFor, PlanResult } from "./types.js";

function missing(
  ctx: PlanContext,
  ids: readonly NodeId[],
): PlanResult | undefined {
  for (const id of ids) if (!ctx.reader.getNode(id)) return unknownEntity(id);
  return undefined;
}

export const planMoveNodes: PlannerFor<"moveNodes"> = (command, ctx) => {
  const bad = missing(
    ctx,
    command.moves.map((m) => m.node),
  );
  if (bad) return bad;
  const last = new Map(command.moves.map((m) => [m.node, m.position]));
  const ops: PatchOp[] = [];
  for (const [id, position] of last) {
    const node = ctx.reader.getNode(id);
    if (
      !node ||
      (node.position.x === position.x && node.position.y === position.y)
    )
      continue;
    ops.push({
      op: "update",
      entity: "node",
      id,
      fields: { position: { old: node.position, new: position } },
    });
  }
  ops.push(...shiftPins(ctx, last));
  return ready("Move", ops, ctx.ids);
};

/**
 * Route updates for connections whose both endpoint nodes move: their pins shift
 * by the mean of the two node offsets, which is the common offset in a whole-group move.
 * A connection with one fixed end keeps its pins. Ordered by connection collection order.
 */
function shiftPins(
  ctx: PlanContext,
  targets: ReadonlyMap<NodeId, Vec2>,
): PatchOp[] {
  const delta = (id: NodeId): Vec2 | undefined => {
    const node = ctx.reader.getNode(id);
    const to = targets.get(id);
    if (!node || !to) return undefined;
    const d = { x: to.x - node.position.x, y: to.y - node.position.y };
    return d.x === 0 && d.y === 0 ? undefined : d;
  };
  const ops: PatchOp[] = [];
  for (const c of ctx.reader.connections()) {
    if (!c.route) continue;
    const a = delta(c.from.node);
    const b = delta(c.to.node);
    if (!a || !b) continue;
    const route = translateConstraints(
      c.route,
      (a.x + b.x) / 2,
      (a.y + b.y) / 2,
    );
    ops.push({
      op: "update",
      entity: "connection",
      id: c.id,
      fields: { route: { old: c.route, new: route } },
    });
  }
  return ops;
}

export const planRotateNodes: PlannerFor<"rotateNodes"> = (command, ctx) => {
  const bad = missing(ctx, command.nodes);
  if (bad) return bad;
  const ops: PatchOp[] = [];
  for (const id of new Set(command.nodes)) {
    const node = ctx.reader.getNode(id);
    if (!node) continue;
    const next = ((node.rotation + command.turns + 4) % 4) as QuarterTurns;
    ops.push({
      op: "update",
      entity: "node",
      id,
      fields: { rotation: { old: node.rotation, new: next } },
    });
  }
  return ready("Rotate", ops, ctx.ids);
};

export const planMirrorNodes: PlannerFor<"mirrorNodes"> = (command, ctx) => {
  const bad = missing(ctx, command.nodes);
  if (bad) return bad;
  const axis = command.axis ?? "horizontal";
  const ops: PatchOp[] = [];
  for (const id of new Set(command.nodes)) {
    const node = ctx.reader.getNode(id);
    if (!node) continue;
    const rotation = mirroredRotation(node.rotation, axis);
    ops.push({
      op: "update",
      entity: "node",
      id,
      fields: {
        mirrored: { old: node.mirrored, new: !node.mirrored },
        ...(rotation === node.rotation
          ? {}
          : { rotation: { old: node.rotation, new: rotation } }),
      },
    });
  }
  return ready("Mirror", ops, ctx.ids);
};

/**
 * Explicit paint-order change. The nodes keep their relative order and receive
 * `z` values just above the current top (front) or below the current bottom (back).
 */
export const planReorderNodes: PlannerFor<"reorderNodes"> = (command, ctx) => {
  const bad = missing(ctx, command.nodes);
  if (bad) return bad;
  const chosen = new Set(command.nodes);
  const order = ctx.reader.paintOrder();
  const picked = order.filter((n) => chosen.has(n.id));
  const top = order[order.length - 1]?.z ?? 0;
  const bottom = order[0]?.z ?? 0;
  const base = command.to === "front" ? top + 1 : bottom - picked.length;
  const ops: PatchOp[] = picked.map((node, i) => ({
    op: "update",
    entity: "node",
    id: node.id,
    fields: { z: { old: node.z, new: base + i } },
  }));
  return ready(
    command.to === "front" ? "Bring to front" : "Send to back",
    ops,
    ctx.ids,
  );
};
