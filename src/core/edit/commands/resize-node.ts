/**
 * resizeNode planner (NOD-04a).
 *
 * One node update with the new `size` and, when the fixed point is not the centre, the
 * anchored `position`, so the named local point keeps its world position for any
 * rotation and mirroring. A size outside the resolved limits is rejected, never
 * clamped: the caller learns exactly what happened and can read `model.sizeLimits(id)`.
 */
import { anchoredPosition, CENTER_FIXED } from "../../data/model/node-frame.js";
import { isFiniteSize, type Size } from "../../data/model/values.js";
import type { NodeFieldChanges, PatchOp } from "../../data/patch/types.js";
import { ready, rejected, unknownEntity } from "./ops.js";
import type { ResolvedSizeLimits } from "./size-limits.js";
import type { PlannerFor } from "./types.js";

const format = (s: Size): string => `${s.width} x ${s.height}`;

/** The first violated bound, described for the rejection message. */
function violated(size: Size, limits: ResolvedSizeLimits): string | undefined {
  if (size.width < limits.min.width || size.height < limits.min.height)
    return `below the minimum ${format(limits.min)}`;
  if (size.width > limits.max.width || size.height > limits.max.height)
    return `above the maximum ${format(limits.max)}`;
  return undefined;
}

export const planResizeNode: PlannerFor<"resizeNode"> = (command, ctx) => {
  const node = ctx.reader.getNode(command.node);
  if (!node) return unknownEntity(command.node);
  const { size } = command;
  if (!isFiniteSize(size)) {
    return rejected(
      "non-finite",
      `Size of node ${node.id} must be finite and non-negative`,
      [node.id],
    );
  }
  const outside = violated(size, ctx.sizeLimits(node));
  if (outside) {
    return rejected(
      "out-of-range",
      `Size ${format(size)} of node ${node.id} is ${outside}`,
      [node.id],
    );
  }
  if (size.width === node.size.width && size.height === node.size.height)
    return ready("Resize", [], ctx.ids);
  const position = anchoredPosition(node, size, command.fixed ?? CENTER_FIXED);
  const moved =
    position.x !== node.position.x || position.y !== node.position.y;
  const fields: NodeFieldChanges = {
    size: { old: node.size, new: { width: size.width, height: size.height } },
    ...(moved ? { position: { old: node.position, new: position } } : {}),
  };
  const ops: PatchOp[] = [
    { op: "update", entity: "node", id: node.id, fields },
  ];
  return ready("Resize", ops, ctx.ids);
};
