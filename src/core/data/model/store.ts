/**
 * Internal graph store. Not exported from the package entry point.
 *
 * Holds ordered collections and indexes. It changes only inside `batch()`, indexes are
 * updated as each operation lands, and structural integrity is verified once when the
 * batch ends, before anyone can read. Reads from outside the batch are refused
 * while it is open (see `GraphStore.inBatch`). The store neither validates nor rolls
 * back: whoever opens a batch must commit only already-validated changes.
 */
import type { ConnectionId, NodeId, PortId } from "../../base/ids/ids.js";
import { MisuseError } from "../../base/result.js";
import {
  type Collection,
  createCollection,
  type Entry,
  type MutableCollection,
} from "./collection.js";
import { deepFreeze, freezeShell } from "./freeze.js";
import { createIndexes, type GraphIndexes } from "./indexes.js";
import type { ConnectionRecord, NodeRecord, PortRecord } from "./records.js";

export interface StoreOptions {
  /** Freeze committed records and snapshot arrays. Defaults to true; production may pass false. */
  readonly freezeRecords?: boolean;
}

export interface PutOptions {
  /** Reuse an earlier sequence number (undo restores an entity in its old position). */
  readonly seq?: number;
}

/** Write access, valid only while its batch is running. */
export interface StoreTx {
  getNode(id: NodeId): NodeRecord | undefined;
  getPort(id: PortId): PortRecord | undefined;
  getConnection(id: ConnectionId): ConnectionRecord | undefined;
  /** Add or replace. A replacement keeps the entry's `seq`. Returns the `seq`. */
  putNode(record: NodeRecord, options?: PutOptions): number;
  putPort(record: PortRecord, options?: PutOptions): number;
  putConnection(record: ConnectionRecord, options?: PutOptions): number;
  /** Remove, returning the removed entry (with its `seq`) so it can be restored. */
  removeNode(id: NodeId): Entry<NodeRecord> | undefined;
  removePort(id: PortId): Entry<PortRecord> | undefined;
  removeConnection(id: ConnectionId): Entry<ConnectionRecord> | undefined;
}

export interface GraphStore {
  readonly nodes: Collection<NodeRecord>;
  readonly ports: Collection<PortRecord>;
  readonly connections: Collection<ConnectionRecord>;
  readonly indexes: GraphIndexes;
  readonly freezeRecords: boolean;
  revision(): number;
  inBatch(): boolean;
  /** Nodes ordered by `(z, seq)` ascending; cached per revision. */
  paintOrder(): readonly NodeRecord[];
  /** Lowest and highest `z`, or undefined when empty. */
  zRange(): { readonly min: number; readonly max: number } | undefined;
  batch<T>(fn: (tx: StoreTx) => T): T;
}

export function createGraphStore(options: StoreOptions = {}): GraphStore {
  const freezeRecords = options.freezeRecords ?? true;
  const nodes = createCollection<NodeRecord>(freezeRecords);
  const ports = createCollection<PortRecord>(freezeRecords);
  const connections = createCollection<ConnectionRecord>(freezeRecords);
  const indexes = createIndexes();
  let revision = 0;
  let nextSeq = 1;
  let open = false;
  let touched = new Set<string>();
  let paint: readonly NodeRecord[] | undefined;
  let zBounds: { min: number; max: number } | undefined;
  let zDirty = false;

  const prepare = <T>(record: T): T =>
    freezeRecords ? deepFreeze(record) : record;

  function allocate(
    id: string,
    own: Collection<unknown>,
    others: readonly Collection<unknown>[],
    seq: number | undefined,
  ): number {
    if (others.some((c) => c.has(id)))
      throw new MisuseError(`ID ${id} is already used by another kind`);
    const existing = own.seqOf(id);
    if (existing !== undefined) return existing;
    const assigned = seq ?? nextSeq;
    nextSeq = Math.max(nextSeq, assigned + 1);
    return assigned;
  }

  function trackZ(z: number): void {
    if (!zBounds) zBounds = { min: z, max: z };
    else
      zBounds = {
        min: Math.min(zBounds.min, z),
        max: Math.max(zBounds.max, z),
      };
  }

  function writer(): StoreTx {
    const live = () => {
      if (!open)
        throw new MisuseError("Store transaction used outside its batch");
    };
    const put = <T extends { readonly id: string }>(
      col: MutableCollection<T>,
      record: T,
      seq: number,
    ): number => {
      col.set(record.id, prepare(record), seq);
      touched.add(record.id);
      return seq;
    };
    const take = <T extends { readonly id: string }>(
      col: MutableCollection<T>,
      id: string,
    ) => {
      live();
      const removed = col.delete(id);
      if (removed) touched.add(id);
      return removed;
    };
    return {
      getNode(id) {
        live();
        return nodes.get(id);
      },
      getPort(id) {
        live();
        return ports.get(id);
      },
      getConnection(id) {
        live();
        return connections.get(id);
      },
      putNode(record, o) {
        live();
        const seq = allocate(record.id, nodes, [ports, connections], o?.seq);
        const old = nodes.get(record.id);
        // Re-verify the ports it listed before, so one it dropped is caught.
        for (const p of old?.ports ?? []) touched.add(p);
        if (nodes.size === 0) zBounds = undefined;
        if (old && zBounds && (old.z === zBounds.min || old.z === zBounds.max))
          zDirty = true;
        trackZ(record.z);
        return put(nodes, record, seq);
      },
      putPort(record, o) {
        live();
        return put(
          ports,
          record,
          allocate(record.id, ports, [nodes, connections], o?.seq),
        );
      },
      putConnection(record, o) {
        live();
        const seq = allocate(record.id, connections, [nodes, ports], o?.seq);
        const old = connections.get(record.id);
        if (old) indexes.removeConnection(old);
        const stored = prepare(record);
        indexes.addConnection(stored, seq);
        connections.set(record.id, stored, seq);
        touched.add(record.id);
        return seq;
      },
      removeNode(id) {
        const old = nodes.get(id);
        for (const p of old?.ports ?? []) touched.add(p);
        if (old && zBounds && (old.z === zBounds.min || old.z === zBounds.max))
          zDirty = true;
        return take(nodes, id);
      },
      removePort(id) {
        // Re-verify the owner too, so a node still listing the port is caught.
        const old = ports.get(id);
        if (old) touched.add(old.node);
        return take(ports, id);
      },
      removeConnection(id) {
        const old = connections.get(id);
        if (old) indexes.removeConnection(old);
        return take(connections, id);
      },
    };
  }

  /** Throws MisuseError if the committed batch left the graph structurally inconsistent. */
  function verify(ids: ReadonlySet<string>): void {
    const bad = (msg: string): never => {
      throw new MisuseError(`Batch left the store inconsistent: ${msg}`);
    };
    for (const id of ids) {
      const node = nodes.get(id);
      const port = ports.get(id);
      const conn = connections.get(id);
      if (node) {
        for (const p of node.ports) {
          if (ports.get(p)?.node !== node.id)
            bad(`node ${id} lists missing or foreign port ${p}`);
        }
      } else if (port) {
        if (!nodes.get(port.node)?.ports.includes(port.id))
          bad(`port ${id} has no owning node entry`);
      } else if (conn) {
        for (const e of [conn.from, conn.to]) {
          if (!nodes.has(e.node) || ports.get(e.port)?.node !== e.node) {
            bad(`connection ${id} has a dangling endpoint`);
          }
        }
      } else if (
        indexes.connectionsOfNode(id as NodeId).length > 0 ||
        indexes.connectionsOfPort(id as PortId).length > 0
      ) {
        bad(`removed entity ${id} is still referenced by a connection`);
      }
    }
  }

  return {
    nodes,
    ports,
    connections,
    indexes,
    freezeRecords,
    revision: () => revision,
    inBatch: () => open,
    paintOrder() {
      if (!paint) {
        const sorted = [...nodes.list()].sort(
          (a, b) =>
            a.z - b.z || (nodes.seqOf(a.id) ?? 0) - (nodes.seqOf(b.id) ?? 0),
        );
        paint = freezeShell(sorted, freezeRecords);
      }
      return paint;
    },
    zRange() {
      if (zDirty || (!zBounds && nodes.size > 0)) {
        zBounds = undefined;
        for (const n of nodes.list()) trackZ(n.z);
        zDirty = false;
      }
      return nodes.size === 0 ? undefined : zBounds;
    },
    batch<T>(fn: (tx: StoreTx) => T): T {
      if (open) throw new MisuseError("Nested batches are not supported");
      open = true;
      touched = new Set();
      let result: T;
      try {
        result = fn(writer());
      } finally {
        open = false;
        if (touched.size > 0) {
          revision += 1;
          paint = undefined;
        }
      }
      verify(touched);
      return result;
    },
  };
}
