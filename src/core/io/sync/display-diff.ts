/**
 * The one patch that turns the displayed read model into a target state.
 *
 * The target is either a validated snapshot (a push with nothing pending) or a store
 * built by rebasing. A store is exported to a snapshot first, with payloads of node types
 * that have a codec encoded back to JSON, so `diffSnapshot` compares like with like. A
 * codec that fails makes the result an error list and nothing is applied.
 */
import { EMPTY_CURSOR } from "../../base/ids/id-generator.js";
import { err, type Result } from "../../base/result.js";
import type { GraphReader } from "../../data/model/reader.js";
import type { Patch } from "../../data/patch/types.js";
import { diffSnapshot } from "../snapshot/diff.js";
import { exportSnapshot } from "../snapshot/export.js";
import {
  type PayloadCodecRegistry,
  runCodec,
} from "../snapshot/snapshot-errors.js";
import type {
  GraphSnapshot,
  NodeSnapshot,
  SnapshotError,
} from "../snapshot/snapshot-types.js";

/** `reader` as a snapshot with JSON payloads; errors name the failing node. */
export function snapshotOf(
  reader: GraphReader,
  codecs: PayloadCodecRegistry | undefined,
): Result<GraphSnapshot, readonly SnapshotError[]> {
  const plain = exportSnapshot(
    { reader, idCursor: () => EMPTY_CURSOR },
    { fragment: true },
  );
  if (!codecs) return { ok: true, value: plain };
  const errors: SnapshotError[] = [];
  const nodes = plain.nodes.map((node, i): NodeSnapshot => {
    const codec = codecs.get(node.type);
    if (!codec) return node;
    const encoded = runCodec(() => codec.encode(node.payload));
    if (encoded.ok) return { ...node, payload: encoded.value };
    errors.push({
      ...encoded.rejection,
      path: `nodes[${i}].payload`,
      entities: [node.id, ...encoded.rejection.entities],
    });
    return node;
  });
  if (errors.length > 0) return err(errors);
  return { ok: true, value: { ...plain, nodes } };
}

/** The patch from `displayed` to `target` (a snapshot or a reader). */
export function displayPatch(
  displayed: GraphReader,
  target: GraphSnapshot | GraphReader,
  codecs: PayloadCodecRegistry | undefined,
): Result<Patch, readonly SnapshotError[]> {
  const snapshot =
    "format" in target
      ? { ok: true as const, value: target }
      : snapshotOf(target, codecs);
  if (!snapshot.ok) return snapshot;
  return diffSnapshot(displayed, snapshot.value, codecs ? { codecs } : {});
}
