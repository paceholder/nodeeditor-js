/**
 * Rebasing pending edits on a confirmed state.
 *
 * The target of the displayed read model is built on a scratch copy of the confirmed
 * state by applying the pending patches in submission order. A patch whose effect the
 * copy already holds (every add present, every remove absent, every update's new values
 * current) is skipped, so it is never applied twice. A patch that does not apply
 * atomically is reported as a conflict and skipped. Entries already conflicted stay out.
 *
 * Patches are recorded against the displayed store, whose insertion sequence numbers the
 * confirmed store does not share. Sequence numbers only order entities, so before a patch
 * is applied elsewhere its adds lose their `seq` and its removes take the target's.
 */
import type {
  ConnectionId,
  GroupId,
  NodeId,
  PortId,
} from "../../base/ids/ids.js";
import type { GraphReader } from "../../data/model/reader.js";
import { applyPatch } from "../../data/patch/apply.js";
import { valuesEqual } from "../../data/patch/equal.js";
import type { EntityKind, Patch, PatchOp } from "../../data/patch/types.js";
import { replaceStoreContents } from "../../edit/adapter/replace-document.js";
import {
  createStoreView,
  type PendingEntry,
  type StoreView,
} from "./sync-state.js";

/** A copy of `source` in a fresh store. */
export function copyStore(source: GraphReader): StoreView {
  const view = createStoreView(false);
  replaceStoreContents(view.store, {
    nodes: source.nodes(),
    ports: source.ports(),
    connections: source.connections(),
    groups: source.groups(),
  });
  return view;
}

function lookup(
  reader: GraphReader,
  entity: EntityKind,
  id: string,
): object | undefined {
  if (entity === "node") return reader.getNode(id as NodeId);
  if (entity === "port") return reader.getPort(id as PortId);
  if (entity === "connection") return reader.getConnection(id as ConnectionId);
  return reader.getGroup(id as GroupId);
}

/** `patch` with sequence numbers that fit `target`. */
export function portablePatch(patch: Patch, target: GraphReader): Patch {
  const ops = patch.ops.map((op): PatchOp => {
    if (op.op === "add") {
      if (op.seq === undefined) return op;
      const { seq: _drop, ...rest } = op;
      return rest as PatchOp;
    }
    if (op.op === "remove") {
      const seq = target.seqOf(op.record.id);
      return seq === undefined ? op : ({ ...op, seq } as PatchOp);
    }
    return op;
  });
  return patch.idCursor === undefined
    ? { ops }
    : { ops, idCursor: patch.idCursor };
}

/** Whether `reader` already shows every effect of `patch`. */
export function containsPatch(reader: GraphReader, patch: Patch): boolean {
  return (
    patch.ops.length > 0 &&
    patch.ops.every((op) => {
      if (op.op === "add")
        return lookup(reader, op.entity, op.record.id) !== undefined;
      if (op.op === "remove")
        return lookup(reader, op.entity, op.record.id) === undefined;
      const current = lookup(reader, op.entity, op.id) as
        | Record<string, unknown>
        | undefined;
      if (!current) return false;
      return Object.entries(
        op.fields as Record<string, { new?: unknown }>,
      ).every(([key, change]) => valuesEqual(current[key], change.new));
    })
  );
}

/** Apply `patch` to `view` without validators. True when it applied (or was empty). */
export function applyQuietly(view: StoreView, patch: Patch): boolean {
  return applyPatch(
    view.store,
    view.reader,
    portablePatch(patch, view.reader),
    [],
    {
      origin: "external",
      operationId: "rebase",
    },
  ).ok;
}

export interface Rebased {
  /** Confirmed state plus every pending patch that still applies. */
  readonly target: StoreView;
  /** Entries whose patch no longer applies, in submission order. */
  readonly conflicts: readonly PendingEntry[];
}

/** Build the displayed target from `confirmed` and the live pending entries. */
export function rebase(
  confirmed: GraphReader,
  entries: readonly PendingEntry[],
): Rebased {
  const target = copyStore(confirmed);
  const conflicts: PendingEntry[] = [];
  for (const entry of entries) {
    if (entry.state === "conflicted") continue;
    if (containsPatch(target.reader, entry.patch)) continue;
    if (!applyQuietly(target, entry.patch)) conflicts.push(entry);
  }
  return { target, conflicts };
}
