/**
 * Read interface shared by views, policies, planners and adapters.
 *
 * Works headlessly in any JavaScript runtime. Returned records are deep-readonly and
 * frozen unless freezing was turned off. All lists come back in deterministic order:
 * insertion order unless stated otherwise. While a store batch is open,
 * reads throw `MisuseError`, so outside readers never see half-applied changes.
 */
import type { ConnectionId, NodeId, PortId } from "../../base/ids/ids.js";
import { MisuseError } from "../../base/result.js";
import type { ConnectionRecord, NodeRecord, PortRecord } from "./records.js";
import { createStateCache, type GraphState } from "./state.js";
import type { GraphStore } from "./store.js";

export interface GraphReader {
  /** Increases by one for every committed batch that changed anything. */
  revision(): number;
  getNode(id: NodeId): NodeRecord | undefined;
  getPort(id: PortId): PortRecord | undefined;
  getConnection(id: ConnectionId): ConnectionRecord | undefined;
  /** All nodes in insertion order. */
  nodes(): readonly NodeRecord[];
  ports(): readonly PortRecord[];
  connections(): readonly ConnectionRecord[];
  /** Nodes in paint order: `(z, seq)` ascending, last painted is on top. */
  paintOrder(): readonly NodeRecord[];
  /** Ports of a node in the node's presentation order. */
  portsOf(node: NodeId): readonly PortRecord[];
  /** Connections attached to either end of a node, in insertion order. */
  connectionsOfNode(node: NodeId): readonly ConnectionRecord[];
  /** Connections attached to a port, in insertion order. */
  connectionsOfPort(port: PortId): readonly ConnectionRecord[];
  /** Distinct nodes joined to `node` by a connection, in insertion order; self excluded. */
  neighbors(node: NodeId): readonly NodeRecord[];
  /** Insertion sequence of a node, port or connection; undefined if absent. */
  seqOf(id: NodeId | PortId | ConnectionId): number | undefined;
  /** The ID of the entity of `kind` whose insertion sequence is `seq`, if any. */
  idWithSeq(
    kind: "node" | "port" | "connection",
    seq: number,
  ): string | undefined;
  /** Snapshot of the whole committed graph; reused while the revision is unchanged. */
  state(): GraphState;
}

export function createGraphReader(store: GraphStore): GraphReader {
  const stateOf = createStateCache(store);
  const guard = <T>(read: () => T): T => {
    if (store.inBatch())
      throw new MisuseError("Cannot read the graph while a batch is open");
    return read();
  };
  const connectionsOf = (
    ids: readonly ConnectionId[],
  ): readonly ConnectionRecord[] =>
    ids.flatMap((id) => {
      const c = store.connections.get(id);
      return c ? [c] : [];
    });

  return {
    revision: () => store.revision(),
    getNode: (id) => guard(() => store.nodes.get(id)),
    getPort: (id) => guard(() => store.ports.get(id)),
    getConnection: (id) => guard(() => store.connections.get(id)),
    nodes: () => guard(() => store.nodes.list()),
    ports: () => guard(() => store.ports.list()),
    connections: () => guard(() => store.connections.list()),
    paintOrder: () => guard(() => store.paintOrder()),
    portsOf: (node) =>
      guard(() =>
        (store.nodes.get(node)?.ports ?? []).flatMap((id) => {
          const p = store.ports.get(id);
          return p ? [p] : [];
        }),
      ),
    connectionsOfNode: (node) =>
      guard(() => connectionsOf(store.indexes.connectionsOfNode(node))),
    connectionsOfPort: (port) =>
      guard(() => connectionsOf(store.indexes.connectionsOfPort(port))),
    neighbors: (node) =>
      guard(() =>
        store.indexes
          .neighbors(
            node,
            (id, from) => {
              const c = store.connections.get(id);
              if (!c) return undefined;
              return c.from.node === from ? c.to.node : c.from.node;
            },
            (id) => store.nodes.seqOf(id),
          )
          .flatMap((id) => {
            const n = store.nodes.get(id);
            return n ? [n] : [];
          }),
      ),
    seqOf: (id) =>
      guard(
        () =>
          store.nodes.seqOf(id) ??
          store.ports.seqOf(id) ??
          store.connections.seqOf(id),
      ),
    idWithSeq: (kind, seq) =>
      guard(() =>
        (kind === "node"
          ? store.nodes
          : kind === "port"
            ? store.ports
            : store.connections
        ).idAt(seq),
      ),
    state: () => guard(stateOf),
  };
}
