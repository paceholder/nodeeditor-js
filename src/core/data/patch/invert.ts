/**
 * Inverse patches.
 *
 * The inverse reverses the operation order, turns adds into removes and removes into
 * adds (both carrying `seq`), and swaps old and new in updates. The ID cursor is never
 * inverted, so undoing a create does not free the ID.
 */
import { MisuseError } from "../../base/result.js";
import type { Patch, PatchOp } from "./types.js";

function swapFields<F extends object>(fields: F): F {
  const swapped: Record<string, unknown> = {};
  for (const [key, change] of Object.entries(fields)) {
    const c = change as { old?: unknown; new?: unknown };
    const next: { old?: unknown; new?: unknown } = {};
    if ("new" in c) next.old = c.new;
    if ("old" in c) next.new = c.old;
    swapped[key] = next;
  }
  return swapped as F;
}

function need(seq: number | undefined, id: string): number {
  if (seq === undefined) {
    throw new MisuseError(
      `Cannot invert an add without seq (${id}); invert the applied patch`,
    );
  }
  return seq;
}

function invertOp(op: PatchOp): PatchOp {
  switch (op.op) {
    case "add":
      switch (op.entity) {
        case "node":
          return {
            op: "remove",
            entity: "node",
            record: op.record,
            seq: need(op.seq, op.record.id),
          };
        case "port":
          return {
            op: "remove",
            entity: "port",
            record: op.record,
            seq: need(op.seq, op.record.id),
          };
        case "connection":
          return {
            op: "remove",
            entity: "connection",
            record: op.record,
            seq: need(op.seq, op.record.id),
          };
      }
      break;
    case "remove":
      switch (op.entity) {
        case "node":
          return { op: "add", entity: "node", record: op.record, seq: op.seq };
        case "port":
          return { op: "add", entity: "port", record: op.record, seq: op.seq };
        case "connection":
          return {
            op: "add",
            entity: "connection",
            record: op.record,
            seq: op.seq,
          };
      }
      break;
    case "update":
      switch (op.entity) {
        case "node":
          return { ...op, fields: swapFields(op.fields) };
        case "port":
          return { ...op, fields: swapFields(op.fields) };
        case "connection":
          return { ...op, fields: swapFields(op.fields) };
      }
  }
}

/**
 * Build the patch that undoes `patch`. Pass an applied patch (adds carry `seq`);
 * throws `MisuseError` for an add without one.
 */
export function invertPatch(patch: Patch): Patch {
  return { ops: patch.ops.map(invertOp).reverse() };
}
