/**
 * Incidence, attachment and neighbor indexes.
 *
 * Every connection is indexed under both of its endpoint nodes and both of its ports, so
 * undirected connections are found from either side. Buckets are arrays kept sorted by
 * `seq`, so queries return deterministic order and cost O(entries for that key), never
 * O(all connections). Internal to the store.
 */
import type { ConnectionId, NodeId, PortId } from "../../base/ids/ids.js";
import type { ConnectionRecord } from "./records.js";

interface Item {
  readonly id: ConnectionId;
  readonly seq: number;
}

export interface GraphIndexes {
  addConnection(record: ConnectionRecord, seq: number): void;
  removeConnection(record: ConnectionRecord): void;
  /** Connection IDs attached to a node (either endpoint), in `seq` order. */
  connectionsOfNode(node: NodeId): readonly ConnectionId[];
  /** Connection IDs attached to a port, in `seq` order. */
  connectionsOfPort(port: PortId): readonly ConnectionId[];
  /** Distinct nodes joined to `node` by a connection (self excluded). */
  neighbors(
    node: NodeId,
    otherEnd: (id: ConnectionId, from: NodeId) => NodeId | undefined,
    nodeSeq: (id: NodeId) => number | undefined,
  ): readonly NodeId[];
  /** Number of index entries returned by queries so far (instrumentation). */
  visited(): number;
}

type Buckets = Map<string, Item[]>;

function insert(buckets: Buckets, key: string, item: Item): void {
  const bucket = buckets.get(key);
  if (!bucket) {
    buckets.set(key, [item]);
    return;
  }
  let at = bucket.length;
  while (at > 0 && (bucket[at - 1] as Item).seq > item.seq) at -= 1;
  bucket.splice(at, 0, item);
}

function remove(buckets: Buckets, key: string, id: ConnectionId): void {
  const bucket = buckets.get(key);
  if (!bucket) return;
  const at = bucket.findIndex((i) => i.id === id);
  if (at >= 0) bucket.splice(at, 1);
  if (bucket.length === 0) buckets.delete(key);
}

export function createIndexes(): GraphIndexes {
  const byNode: Buckets = new Map();
  const byPort: Buckets = new Map();
  let visits = 0;

  const read = (buckets: Buckets, key: string): readonly ConnectionId[] => {
    const bucket = buckets.get(key) ?? [];
    visits += bucket.length;
    return bucket.map((i) => i.id);
  };

  return {
    addConnection(record, seq) {
      const item = { id: record.id, seq };
      for (const n of new Set([record.from.node, record.to.node]))
        insert(byNode, n, item);
      for (const p of new Set([record.from.port, record.to.port]))
        insert(byPort, p, item);
    },
    removeConnection(record) {
      for (const n of new Set([record.from.node, record.to.node]))
        remove(byNode, n, record.id);
      for (const p of new Set([record.from.port, record.to.port]))
        remove(byPort, p, record.id);
    },
    connectionsOfNode: (node) => read(byNode, node),
    connectionsOfPort: (port) => read(byPort, port),
    neighbors(node, otherEnd, nodeSeq) {
      const found = new Set<NodeId>();
      for (const id of read(byNode, node)) {
        const other = otherEnd(id, node);
        if (other !== undefined && other !== node) found.add(other);
      }
      return [...found].sort((a, b) => (nodeSeq(a) ?? 0) - (nodeSeq(b) ?? 0));
    },
    visited: () => visits,
  };
}
