/**
 * Internal graph store. Not exported from the package entry point.
 *
 * Holds ordered collections and indexes. It changes only inside `batch()`, indexes are
 * updated as each operation lands, and structural integrity is verified once when the
 * batch ends, before anyone can read. Reads from outside the batch are refused
 * while it is open (see `GraphStore.inBatch`). The store neither validates nor rolls
 * back: whoever opens a batch must commit only already-validated changes.
 */
import type {
  ConnectionId,
  GroupId,
  NodeId,
  PortId,
} from "../../base/ids/ids.js";
import { MisuseError } from "../../base/result.js";
import {
  type Collection,
  createCollection,
  type Entry,
  type MutableCollection,
} from "./collection.js";
import { deepFreeze, freezeShell } from "./freeze.js";
import { createGroupIndex } from "./group-index.js";
import { createIndexes, type GraphIndexes } from "./indexes.js";
import type {
  ConnectionRecord,
  GroupRecord,
  NodeRecord,
  PortRecord,
} from "./records.js";

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
  getGroup(id: GroupId): GroupRecord | undefined;
  /** Add or replace. A replacement keeps the entry's `seq`. Returns the `seq`. */
  putNode(record: NodeRecord, options?: PutOptions): number;
  putPort(record: PortRecord, options?: PutOptions): number;
  putConnection(record: ConnectionRecord, options?: PutOptions): number;
  putGroup(record: GroupRecord, options?: PutOptions): number;
  /** Remove, returning the removed entry (with its `seq`) so it can be restored. */
  removeNode(id: NodeId): Entry<NodeRecord> | undefined;
  removePort(id: PortId): Entry<PortRecord> | undefined;
  removeConnection(id: ConnectionId): Entry<ConnectionRecord> | undefined;
  removeGroup(id: GroupId): Entry<GroupRecord> | undefined;
}

export interface GraphStore {
  readonly nodes: Collection<NodeRecord>;
  readonly ports: Collection<PortRecord>;
  readonly connections: Collection<ConnectionRecord>;
  readonly groups: Collection<GroupRecord>;
  readonly indexes: GraphIndexes;
  /** Member node IDs of a group, in node collection order. */
  membersOf(group: GroupId): readonly NodeId[];
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
  const groups = createCollection<GroupRecord>(freezeRecords);
  const members = createGroupIndex();
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

  /** Move a node between member buckets; both groups are re-verified at batch end. */
  function regroup(
    node: NodeId,
    from: GroupId | undefined,
    to: GroupId | undefined,
    seq: number,
  ): void {
    if (from !== undefined) {
      members.remove(from, node);
      touched.add(from);
    }
    if (to !== undefined) {
      members.add(to, node, seq);
      touched.add(to);
    }
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
      getGroup(id) {
        live();
        return groups.get(id);
      },
      putNode(record, o) {
        live();
        const seq = allocate(
          record.id,
          nodes,
          [ports, connections, groups],
          o?.seq,
        );
        const old = nodes.get(record.id);
        regroup(record.id, old?.group, record.group, seq);
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
          allocate(record.id, ports, [nodes, connections, groups], o?.seq),
        );
      },
      putConnection(record, o) {
        live();
        const seq = allocate(
          record.id,
          connections,
          [nodes, ports, groups],
          o?.seq,
        );
        const old = connections.get(record.id);
        if (old) indexes.removeConnection(old);
        const stored = prepare(record);
        indexes.addConnection(stored, seq);
        connections.set(record.id, stored, seq);
        touched.add(record.id);
        return seq;
      },
      putGroup(record, o) {
        live();
        return put(
          groups,
          record,
          allocate(record.id, groups, [nodes, ports, connections], o?.seq),
        );
      },
      removeNode(id) {
        const old = nodes.get(id);
        if (old) regroup(id, old.group, undefined, 0);
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
      removeGroup: (id) => take(groups, id),
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
      const group = groups.get(id);
      if (node) {
        if (node.group !== undefined && !groups.has(node.group))
          bad(`node ${id} names missing group ${node.group}`);
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
      } else if (group) {
        if (members.membersOf(group.id).length === 0)
          bad(`group ${id} has no members`);
      } else if (members.membersOf(id as GroupId).length > 0) {
        bad(`removed group ${id} is still named by a node`);
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
    groups,
    indexes,
    membersOf: (group) => members.membersOf(group),
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
