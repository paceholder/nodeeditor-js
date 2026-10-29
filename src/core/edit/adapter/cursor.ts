/**
 * Forward-only ID cursor merging.
 *
 * Generator cursors are opaque, so the model cannot compare them in general. For the
 * numeric counters the default generator uses, the larger value wins per key. A
 * non-numeric entry is kept as is once present. Ids supplied by a patch also pass through
 * the generator's `observe` hook, when it has one.
 */
import type { IdCursor, IdGenerator } from "../../base/ids/id-generator.js";
import type { Patch } from "../../data/patch/types.js";

export function mergeCursor(current: IdCursor, incoming: IdCursor): IdCursor {
  let merged: Record<string, number | string> | undefined;
  for (const [key, value] of Object.entries(incoming)) {
    const existing = current[key];
    const takes =
      existing === undefined ||
      (typeof existing === "number" &&
        typeof value === "number" &&
        value > existing);
    if (takes) {
      merged ??= { ...current };
      merged[key] = value;
    }
  }
  return merged ?? current;
}

/** Advance `cursor` past the patch's own cursor and every ID the patch adds. */
export function advanceCursor(
  generator: IdGenerator,
  cursor: IdCursor,
  patch: Patch,
): IdCursor {
  let next = patch.idCursor ? mergeCursor(cursor, patch.idCursor) : cursor;
  if (generator.observe) {
    for (const op of patch.ops) {
      if (op.op === "add") next = generator.observe(op.record.id, next);
    }
  }
  return next;
}
