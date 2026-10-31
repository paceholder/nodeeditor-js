/**
 * Compound field rules (NOD-04a, MOD-11).
 *
 * Some updates change one field as a consequence of another, and that consequence is
 * judged by the action that caused it:
 *
 * - An anchored resize moves the centre. When an update changes `size`, its `position`
 *   change is covered by `resize` if, in the node's local frame, it is no larger than
 *   half the size change on each axis. Anything larger also needs `move`.
 * - A screen-axis mirror changes the rotation. When an update toggles `mirrored`, its
 *   `rotation` change is covered by `mirror` if the new rotation is one of the two mirror
 *   results (`-r` or `2 - r`). Any other rotation change also needs `rotate`.
 *
 * Commands, raw patches and undo are judged alike; undo of a resize or a mirror is the
 * same compound change in reverse.
 */
import {
  frameVectorInverse,
  mirroredRotation,
} from "../../data/model/node-frame.js";
import type { NodeRecord } from "../../data/model/records.js";
import type { NodeFieldChanges } from "../../data/patch/types.js";

/** Relative tolerance for the position a resize implies (float subtraction only). */
const TOLERANCE = 1e-9;

/** Fields of `fields` whose own action is replaced by the action of another field. */
export function coveredFields(
  node: NodeRecord,
  fields: NodeFieldChanges,
): ReadonlySet<keyof NodeFieldChanges> {
  const covered = new Set<keyof NodeFieldChanges>();
  if (resizeCoversPosition(node, fields)) covered.add("position");
  if (mirrorCoversRotation(node, fields)) covered.add("rotation");
  return covered;
}

function resizeCoversPosition(
  node: NodeRecord,
  fields: NodeFieldChanges,
): boolean {
  const { size, position } = fields;
  if (!size?.new || !position?.new) return false;
  const oldSize = size.old ?? node.size;
  const from = position.old ?? node.position;
  const to = position.new;
  const local = frameVectorInverse(node, {
    x: to.x - from.x,
    y: to.y - from.y,
  });
  const scale = Math.max(
    1,
    Math.abs(from.x),
    Math.abs(from.y),
    Math.abs(to.x),
    Math.abs(to.y),
  );
  const within = (shift: number, sizeChange: number) =>
    Math.abs(shift) <=
    Math.abs(sizeChange) / 2 +
      TOLERANCE * Math.max(scale, Math.abs(sizeChange));
  return (
    within(local.x, size.new.width - oldSize.width) &&
    within(local.y, size.new.height - oldSize.height)
  );
}

function mirrorCoversRotation(
  node: NodeRecord,
  fields: NodeFieldChanges,
): boolean {
  const { mirrored, rotation } = fields;
  if (mirrored?.new === undefined || rotation?.new === undefined) return false;
  if (mirrored.new === (mirrored.old ?? node.mirrored)) return false;
  const from = rotation.old ?? node.rotation;
  return (
    rotation.new === mirroredRotation(from, "horizontal") ||
    rotation.new === mirroredRotation(from, "vertical")
  );
}
