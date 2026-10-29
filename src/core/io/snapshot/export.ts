/**
 * Deterministic snapshot export.
 *
 * Walks the read model in its explicit orders: nodes in paint order, ports in the node's
 * presentation order, connections in collection order. Only committed state is read, so
 * pending edits, previews, caches, viewport and selection never appear. Payloads are
 * shared by reference and never re-sorted, so opaque payloads stay byte-identical.
 */
import type { IdCursor } from "../../base/ids/id-generator.js";
import type { GraphReader } from "../../data/model/reader.js";
import { connectionToSnapshot, nodeToSnapshot } from "./records.js";
import {
  FORMAT_VERSION,
  type GraphSnapshot,
  SNAPSHOT_FORMAT,
} from "./snapshot-types.js";

/** What export needs from a model: `GraphModel` satisfies it. */
export interface SnapshotSource {
  readonly reader: GraphReader;
  idCursor(): IdCursor;
}

export interface ExportOptions {
  /** Leave out the ID cursor, producing a fragment. Defaults to false. */
  readonly fragment?: boolean;
}

/** Cursor with keys in code-unit order, so equal state gives equal JSON text. */
function sortedCursor(cursor: IdCursor): IdCursor {
  const out: Record<string, number | string> = {};
  for (const key of Object.keys(cursor).sort()) {
    const value = cursor[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}

export function exportSnapshot(
  source: SnapshotSource,
  options: ExportOptions = {},
): GraphSnapshot {
  const { reader } = source;
  return {
    format: SNAPSHOT_FORMAT,
    version: FORMAT_VERSION,
    ...(options.fragment ? {} : { idCursor: sortedCursor(source.idCursor()) }),
    nodes: reader
      .paintOrder()
      .map((node) => nodeToSnapshot(node, reader.portsOf(node.id))),
    connections: reader.connections().map(connectionToSnapshot),
  };
}
