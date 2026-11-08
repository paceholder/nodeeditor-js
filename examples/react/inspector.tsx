import type { ConnectionId, NodeId } from "nodeeditor-js";
import { useConnection, useNode, useSelection } from "nodeeditor-js/react";

/**
 * Says how many entities are selected and shows the primary one, the entity selected last.
 * Re-renders on selection changes, not on every drag step.
 */
export function Inspector() {
  const { nodes, connections, primary } = useSelection();
  const count = nodes.length + connections.length;
  return (
    <aside className="inspector">
      <h2>Inspector</h2>
      <p>
        {count} selected
        {count > 0 &&
          ` (${nodes.length} node${nodes.length === 1 ? "" : "s"}, ${connections.length} connection${connections.length === 1 ? "" : "s"})`}
      </p>
      {primary?.kind === "node" && <NodeDetails id={primary.id} />}
      {primary?.kind === "connection" && <ConnectionDetails id={primary.id} />}
      {!primary && <p>Select a node.</p>}
    </aside>
  );
}

// Subscribes to one node only, so edits elsewhere do not render this.
function NodeDetails({ id }: { id: NodeId }) {
  const node = useNode(id);
  if (!node) return <p>Node removed.</p>;
  return (
    <dl>
      <dt>Primary node</dt>
      <dd>{node.title}</dd>
      <dt>Position</dt>
      <dd>
        {Math.round(node.position.x)}, {Math.round(node.position.y)}
      </dd>
    </dl>
  );
}

function ConnectionDetails({ id }: { id: ConnectionId }) {
  const connection = useConnection(id);
  if (!connection) return <p>Connection removed.</p>;
  return (
    <dl>
      <dt>Primary connection</dt>
      <dd>{connection.id}</dd>
    </dl>
  );
}
