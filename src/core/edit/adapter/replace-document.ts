/**
 * Whole-document replacement of the store.
 *
 * The replacement is checked in full before the store changes: every record valid, IDs
 * unique across kinds, each port listed by its node and each listed port owned by that
 * node, and every connection endpoint present. Bad input throws `MisuseError` with the
 * store untouched; the store's own end-of-batch check would otherwise throw only after
 * the document had changed. The checked copies are then written in one store batch, so
 * readers never see a half-loaded document. Entities get fresh sequence numbers in the
 * order given (nodes, then ports, then connections), which makes the loaded collection
 * order equal to the snapshot order.
 */
import type { IdCursor } from "../../base/ids/id-generator.js";
import type { NodeId, PortId } from "../../base/ids/ids.js";
import { MisuseError, type Rejection, type Result } from "../../base/result.js";
import type {
  ConnectionRecord,
  NodeRecord,
  PortRecord,
} from "../../data/model/records.js";
import type { GraphStore } from "../../data/model/store.js";
import {
  checkConnectionEndpoints,
  validateConnectionRecord,
  validateNodeRecord,
  validatePortRecord,
} from "../../data/model/validate-records.js";
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

interface Checked {
  readonly nodes: readonly NodeRecord[];
  readonly ports: readonly PortRecord[];
  readonly connections: readonly ConnectionRecord[];
}

const misuse = (message: string): never => {
  throw new MisuseError(`replaceDocument: ${message}`);
};

function all<T>(
  list: readonly unknown[],
  validate: (input: unknown) => Result<T, Rejection>,
): T[] {
  if (!Array.isArray(list)) return misuse("records must be arrays");
  return list.map((input) => {
    const checked = validate(input);
    return checked.ok ? checked.value : misuse(checked.rejection.message);
  });
}

/** Validate a replacement and return copies of its records; throws `MisuseError`. */
export function checkReplacement(replacement: DocumentReplacement): Checked {
  const nodes = all(replacement.nodes, validateNodeRecord);
  const ports = all(replacement.ports, validatePortRecord);
  const connections = all(replacement.connections, validateConnectionRecord);
  const seen = new Set<string>();
  for (const { id } of [...nodes, ...ports, ...connections]) {
    if (seen.has(id)) misuse(`ID ${id} is used twice`);
    seen.add(id);
  }
  const nodeById = new Map<string, NodeRecord>(nodes.map((n) => [n.id, n]));
  const portById = new Map<string, PortRecord>(ports.map((p) => [p.id, p]));
  for (const node of nodes) {
    for (const p of node.ports) {
      if (portById.get(p)?.node !== node.id)
        misuse(`node ${node.id} lists missing or foreign port ${p}`);
    }
  }
  for (const port of ports) {
    if (!nodeById.get(port.node)?.ports.includes(port.id))
      misuse(`port ${port.id} is not listed by node ${port.node}`);
  }
  const lookup = {
    getNode: (id: NodeId) => nodeById.get(id),
    getPort: (id: PortId) => portById.get(id),
  };
  for (const connection of connections) {
    const ends = checkConnectionEndpoints(connection, lookup);
    if (!ends.ok) misuse(ends.rejection.message);
  }
  return { nodes, ports, connections };
}

export function replaceStoreContents(
  store: GraphStore,
  checked: Checked,
): void {
  store.batch((tx) => {
    for (const c of [...store.connections.list()]) tx.removeConnection(c.id);
    for (const p of [...store.ports.list()]) tx.removePort(p.id);
    for (const n of [...store.nodes.list()]) tx.removeNode(n.id);
    for (const n of checked.nodes) tx.putNode(n);
    for (const p of checked.ports) tx.putPort(p);
    for (const c of checked.connections) tx.putConnection(c);
  });
}
