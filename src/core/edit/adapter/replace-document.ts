/**
 * Whole-document replacement of the store (SNP-03, SER-04).
 *
 * Runs as one store batch, so readers never see a half-loaded document. Entities get fresh
 * sequence numbers in the order given (nodes, then ports, then connections), which makes
 * the loaded collection order equal to the snapshot order (MOD-08).
 */
import type { IdCursor } from "../../base/ids/id-generator.js";
import type {
  ConnectionRecord,
  NodeRecord,
  PortRecord,
} from "../../data/model/records.js";
import type { GraphStore } from "../../data/model/store.js";
import type { ChangeOrigin } from "../../data/patch/types.js";

export interface DocumentReplacement {
  readonly nodes: readonly NodeRecord[];
  readonly ports: readonly PortRecord[];
  readonly connections: readonly ConnectionRecord[];
  /** Becomes the model's cursor (not merged: the document owns its retired IDs). */
  readonly idCursor: IdCursor;
  /** Origin reported on the `reset` event; defaults to `local`. */
  readonly origin?: ChangeOrigin;
}

export function replaceStoreContents(
  store: GraphStore,
  replacement: DocumentReplacement,
): void {
  store.batch((tx) => {
    for (const c of [...store.connections.list()]) tx.removeConnection(c.id);
    for (const p of [...store.ports.list()]) tx.removePort(p.id);
    for (const n of [...store.nodes.list()]) tx.removeNode(n.id);
    for (const n of replacement.nodes) tx.putNode(n);
    for (const p of replacement.ports) tx.putPort(p);
    for (const c of replacement.connections) tx.putConnection(c);
  });
}
