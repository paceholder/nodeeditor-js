/**
 * Forward-only ID cursor merging.
 *
 * Generator cursors are opaque, so the model cannot compare them in general. A generator
 * with a `merge` hook decides itself. Otherwise, per key, a number replaces a smaller
 * number, and any other incoming value (text, or a change of type) replaces the current
 * one: the generator produced the patch's cursor from the cursor the planner read. Ids
 * supplied by a patch also pass through the generator's `observe` hook, when it has one.
 */
import type { IdCursor, IdGenerator } from "../../base/ids/id-generator.js";
import type { Patch } from "../../data/patch/types.js";

export function mergeCursor(current: IdCursor, incoming: IdCursor): IdCursor {
  let merged: Record<string, number | string> | undefined;
  for (const [key, value] of Object.entries(incoming)) {
    const existing = current[key];
    const takes =
      existing === undefined ||
      (typeof existing === "number" && typeof value === "number"
        ? value > existing
        : value !== existing);
    if (takes) {
      merged ??= { ...current };
      // Defined, not assigned, so no key can reach the prototype.
      Object.defineProperty(merged, key, {
        value,
        enumerable: true,
        writable: true,
        configurable: true,
      });
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
  const incoming = patch.idCursor;
  let next = !incoming
    ? cursor
    : generator.merge
      ? generator.merge(cursor, incoming)
      : mergeCursor(cursor, incoming);
  if (generator.observe) {
    for (const op of patch.ops) {
      if (op.op === "add") next = generator.observe(op.record.id, next);
    }
  }
  return next;
}
