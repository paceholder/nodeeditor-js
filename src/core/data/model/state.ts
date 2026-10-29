/**
 * Read snapshots (MOD-13).
 *
 * A `GraphState` holds ordered arrays of record references. Records are never mutated in
 * place (an update replaces the record object), so a kept state keeps showing the data
 * it was built from after later commits. States are built lazily, at most once per
 * revision, and frozen unless the store was created with `freezeRecords: false`.
 */
import type { ConnectionRecord, NodeRecord, PortRecord } from "./records.js";
import type { GraphStore } from "./store.js";

/** Deep-readonly snapshot of the committed graph at one revision. */
export interface GraphState {
  readonly revision: number;
  /** Insertion order. */
  readonly nodes: readonly NodeRecord[];
  readonly ports: readonly PortRecord[];
  readonly connections: readonly ConnectionRecord[];
  /** Nodes ordered by `(z, seq)` ascending. */
  readonly paintOrder: readonly NodeRecord[];
}

export function createStateCache(store: GraphStore): () => GraphState {
  let cached: GraphState | undefined;
  return () => {
    const revision = store.revision();
    if (cached?.revision === revision) return cached;
    const built: GraphState = {
      revision,
      nodes: store.nodes.list(),
      ports: store.ports.list(),
      connections: store.connections.list(),
      paintOrder: store.paintOrder(),
    };
    cached = store.freezeRecords ? Object.freeze(built) : built;
    return cached;
  };
}
