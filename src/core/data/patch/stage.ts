/**
 * Copy-on-write overlay over a committed graph.
 *
 * `StagedState` answers every `GraphReader` question as if the staged writes were already
 * committed, while the base reader (and the store behind it) stay untouched. Staging a
 * patch against it lets validation see the whole result before anything changes.
 *
 * Order comes from the collection `seq`: base entries keep theirs, adds with an explicit
 * `seq` use it, and adds without one sort after all of them in the order they were staged.
 */
import type { ConnectionId, NodeId, PortId } from "../../base/ids/ids.js";
import type { GraphReader } from "../model/reader.js";
import type {
  ConnectionRecord,
  NodeRecord,
  PortRecord,
} from "../model/records.js";
import type { GraphState } from "../model/state.js";

/** One staged final state. `record` is undefined when the entity ends up removed. */
export type StagedWrite =
  | {
      readonly kind: "node";
      readonly id: NodeId;
      readonly record: NodeRecord | undefined;
      readonly seq: number | undefined;
    }
  | {
      readonly kind: "port";
      readonly id: PortId;
      readonly record: PortRecord | undefined;
      readonly seq: number | undefined;
    }
  | {
      readonly kind: "connection";
      readonly id: ConnectionId;
      readonly record: ConnectionRecord | undefined;
      readonly seq: number | undefined;
    };

export interface StagedState extends GraphReader {
  /** Stage a record. `seq` undefined means "assign on commit". */
  putNode(record: NodeRecord, seq: number | undefined): void;
  putPort(record: PortRecord, seq: number | undefined): void;
  putConnection(record: ConnectionRecord, seq: number | undefined): void;
  dropNode(id: NodeId): void;
  dropPort(id: PortId): void;
  dropConnection(id: ConnectionId): void;
  /** Final state of every touched entity, in first-touched order. */
  writes(): readonly StagedWrite[];
}

interface Slot<T> {
  readonly record: T | undefined;
  readonly seq: number | undefined;
  /** First-touch position; breaks ties and orders auto-assigned adds. */
  readonly order: number;
}

type Overlay<T> = Map<string, Slot<T>>;

const AFTER_BASE = Number.MAX_SAFE_INTEGER / 2;

export function createStagedState(base: GraphReader): StagedState {
  const nodeSlots: Overlay<NodeRecord> = new Map();
  const portSlots: Overlay<PortRecord> = new Map();
  const connSlots: Overlay<ConnectionRecord> = new Map();
  // Staged connection IDs by every node/port they referenced when staged. Entries can go
  // stale when a connection is re-staged or dropped; queries re-test the current record.
  const stagedByNode = new Map<string, Set<string>>();
  const stagedByPort = new Map<string, Set<string>>();
  let touches = 0;

  const indexStaged = (
    index: Map<string, Set<string>>,
    key: string,
    id: string,
  ) => {
    let ids = index.get(key);
    if (!ids) {
      ids = new Set();
      index.set(key, ids);
    }
    ids.add(id);
  };

  const stage = <T>(
    slots: Overlay<T>,
    id: string,
    record: T | undefined,
    seq: number | undefined,
  ): void => {
    const order = slots.get(id)?.order ?? touches++;
    slots.set(id, { record, seq, order });
  };
  const keyOf = <T>(slot: Slot<T>): number =>
    slot.seq ?? AFTER_BASE + slot.order;

  /** Merge base entries with the overlay, ordered by `(key, order)`. */
  function merged<T extends { readonly id: string }>(
    baseList: readonly T[],
    slots: Overlay<T>,
    baseSeq: (id: string) => number | undefined,
  ): readonly T[] {
    const rows: { key: number; order: number; record: T }[] = [];
    const inBase = new Set<string>();
    for (const record of baseList) {
      inBase.add(record.id);
      const slot = slots.get(record.id);
      if (!slot) {
        rows.push({ key: baseSeq(record.id) ?? 0, order: -1, record });
      } else if (slot.record) {
        rows.push({ key: keyOf(slot), order: slot.order, record: slot.record });
      }
    }
    for (const [id, slot] of slots) {
      if (slot.record && !inBase.has(id)) {
        rows.push({ key: keyOf(slot), order: slot.order, record: slot.record });
      }
    }
    rows.sort((a, b) => a.key - b.key || a.order - b.order);
    return rows.map((r) => r.record);
  }

  const getNode = (id: NodeId) =>
    nodeSlots.has(id) ? nodeSlots.get(id)?.record : base.getNode(id);
  const getPort = (id: PortId) =>
    portSlots.has(id) ? portSlots.get(id)?.record : base.getPort(id);
  const getConnection = (id: ConnectionId) =>
    connSlots.has(id) ? connSlots.get(id)?.record : base.getConnection(id);

  const nodes = () =>
    merged(base.nodes(), nodeSlots, (id) => base.seqOf(id as NodeId));
  const ports = () =>
    merged(base.ports(), portSlots, (id) => base.seqOf(id as PortId));
  const connections = () =>
    merged(base.connections(), connSlots, (id) =>
      base.seqOf(id as ConnectionId),
    );

  /**
   * Staged connections matching `test`, found through the base index plus the overlay
   * index, so the cost depends on the entity's degree rather than the patch size.
   */
  function connectionsWhere(
    fromBase: readonly ConnectionRecord[],
    fromOverlay: ReadonlySet<string> | undefined,
    test: (c: ConnectionRecord) => boolean,
  ): readonly ConnectionRecord[] {
    const ids = new Set<string>(fromBase.map((c) => c.id));
    for (const id of fromOverlay ?? []) ids.add(id);
    const rows: { key: number; order: number; record: ConnectionRecord }[] = [];
    for (const id of ids) {
      const record = getConnection(id as ConnectionId);
      if (!record || !test(record)) continue;
      const slot = connSlots.get(id);
      rows.push({
        key: slot ? keyOf(slot) : (base.seqOf(id as ConnectionId) ?? 0),
        order: slot?.order ?? -1,
        record,
      });
    }
    rows.sort((a, b) => a.key - b.key || a.order - b.order);
    return rows.map((r) => r.record);
  }

  const connectionsOfNode = (node: NodeId) =>
    connectionsWhere(
      base.connectionsOfNode(node),
      stagedByNode.get(node),
      (c) => c.from.node === node || c.to.node === node,
    );

  const seqOf = (id: NodeId | PortId | ConnectionId): number | undefined => {
    const slot = nodeSlots.get(id) ?? portSlots.get(id) ?? connSlots.get(id);
    return slot ? slot.seq : base.seqOf(id);
  };

  const sortedPaint = () =>
    [...nodes()]
      .map((record, index) => ({ record, index }))
      .sort((a, b) => a.record.z - b.record.z || a.index - b.index)
      .map((r) => r.record);

  return {
    revision: () => base.revision(),
    getNode,
    getPort,
    getConnection,
    nodes,
    ports,
    connections,
    paintOrder: sortedPaint,
    portsOf: (node) =>
      (getNode(node)?.ports ?? []).flatMap((id) => {
        const p = getPort(id);
        return p ? [p] : [];
      }),
    connectionsOfNode,
    connectionsOfPort: (port) =>
      connectionsWhere(
        base.connectionsOfPort(port),
        stagedByPort.get(port),
        (c) => c.from.port === port || c.to.port === port,
      ),
    neighbors: (node) => {
      const seen = new Set<string>();
      const out: NodeRecord[] = [];
      for (const c of connectionsOfNode(node)) {
        const other = c.from.node === node ? c.to.node : c.from.node;
        const record = getNode(other);
        if (other === node || seen.has(other) || !record) continue;
        seen.add(other);
        out.push(record);
      }
      return out;
    },
    seqOf,
    state(): GraphState {
      return {
        revision: base.revision(),
        nodes: nodes(),
        ports: ports(),
        connections: connections(),
        paintOrder: sortedPaint(),
      };
    },
    putNode: (record, seq) => stage(nodeSlots, record.id, record, seq),
    putPort: (record, seq) => stage(portSlots, record.id, record, seq),
    putConnection(record, seq) {
      stage(connSlots, record.id, record, seq);
      for (const end of [record.from, record.to]) {
        indexStaged(stagedByNode, end.node, record.id);
        indexStaged(stagedByPort, end.port, record.id);
      }
    },
    dropNode: (id) => stage(nodeSlots, id, undefined, undefined),
    dropPort: (id) => stage(portSlots, id, undefined, undefined),
    dropConnection: (id) => stage(connSlots, id, undefined, undefined),
    writes() {
      const rows: { order: number; write: StagedWrite }[] = [];
      for (const [id, s] of nodeSlots)
        rows.push({
          order: s.order,
          write: {
            kind: "node",
            id: id as NodeId,
            record: s.record,
            seq: s.seq,
          },
        });
      for (const [id, s] of portSlots)
        rows.push({
          order: s.order,
          write: {
            kind: "port",
            id: id as PortId,
            record: s.record,
            seq: s.seq,
          },
        });
      for (const [id, s] of connSlots)
        rows.push({
          order: s.order,
          write: {
            kind: "connection",
            id: id as ConnectionId,
            record: s.record,
            seq: s.seq,
          },
        });
      return rows.sort((a, b) => a.order - b.order).map((r) => r.write);
    },
  };
}
