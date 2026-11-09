/**
 * A reader that pretends one connection does not exist.
 *
 * Commit-time revalidation asks the policy about a connection that is already part of
 * the staged result. Hiding it keeps occupancy and duplicate checks from counting the
 * connection against itself.
 */
import type { ConnectionId } from "../../base/ids/ids.js";
import type { GraphReader } from "../../data/model/reader.js";

export function hideConnection(
  base: GraphReader,
  hidden: ConnectionId,
): GraphReader {
  const visible = <T extends { readonly id: string }>(
    list: readonly T[],
  ): readonly T[] => list.filter((c) => c.id !== hidden);
  return {
    revision: () => base.revision(),
    getNode: (id) => base.getNode(id),
    getPort: (id) => base.getPort(id),
    getConnection: (id) => (id === hidden ? undefined : base.getConnection(id)),
    nodes: () => base.nodes(),
    ports: () => base.ports(),
    connections: () => visible(base.connections()),
    paintOrder: () => base.paintOrder(),
    portsOf: (node) => base.portsOf(node),
    connectionsOfNode: (node) => visible(base.connectionsOfNode(node)),
    connectionsOfPort: (port) => visible(base.connectionsOfPort(port)),
    neighbors(node) {
      const linked = new Set(
        visible(base.connectionsOfNode(node)).flatMap((c) => [
          c.from.node,
          c.to.node,
        ]),
      );
      return base.neighbors(node).filter((n) => linked.has(n.id));
    },
    seqOf: (id) => (id === hidden ? undefined : base.seqOf(id)),
    idWithSeq(kind, seq) {
      const id = base.idWithSeq(kind, seq);
      return id === hidden ? undefined : id;
    },
    state: () => {
      const state = base.state();
      return { ...state, connections: visible(state.connections) };
    },
  };
}
