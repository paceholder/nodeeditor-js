/**
 * Incremental scene updates from committed patches.
 *
 * The patch tells which entities were touched. Geometry-relevant node and port field
 * changes rebuild that node and its incident connections; z-order and other changes only
 * refresh the cached record. Connection ops rebuild just that connection. Work is done in
 * first-touched order, so results do not depend on incidental iteration order.
 */

import type { ConnectionId, NodeId } from "../../base/ids/ids.js";
import type { GraphReader } from "../../data/model/reader.js";
import type { ChangeEvent } from "../../edit/events/types.js";

/** Mutations the scene exposes to the updater. */
export interface SceneOps {
  readonly reader: GraphReader;
  /** Rebuild a node entry from the reader; false (and no entry) when the node is gone. */
  setNode(id: NodeId): boolean;
  refreshNodeRecord(id: NodeId): void;
  removeNode(id: NodeId): void;
  setConnection(id: ConnectionId): boolean;
  removeConnection(id: ConnectionId): void;
  nodesOfType(type: string): readonly NodeId[];
  /** Connections of `kind` that have an entry, in model order. */
  connectionsOfKind(kind: string): readonly ConnectionId[];
}

const NODE_GEOMETRY_FIELDS = [
  "position",
  "size",
  "rotation",
  "mirrored",
  "type",
  "ports",
];
const PORT_GEOMETRY_FIELDS = ["direction", "placement"];

const touches = (fields: object, names: readonly string[]): boolean =>
  names.some((n) => n in fields);

/**
 * Apply a change event, or (with `forceNodes`) rebuild the given nodes and their incident
 * connections, which is how geometry registration changes are handled.
 */
export function applyChange(
  ops: SceneOps,
  event: ChangeEvent | undefined,
  forceNodes: readonly NodeId[] = [],
): void {
  const geometry = new Set<NodeId>(forceNodes);
  const records = new Set<NodeId>();
  const links = new Set<ConnectionId>();
  for (const op of event?.patch.ops ?? []) {
    switch (op.entity) {
      case "node":
        if (op.op !== "update") geometry.add(op.record.id);
        else if (touches(op.fields, NODE_GEOMETRY_FIELDS)) geometry.add(op.id);
        else records.add(op.id);
        break;
      case "port": {
        if (op.op !== "update") geometry.add(op.record.node);
        else if (touches(op.fields, PORT_GEOMETRY_FIELDS)) {
          const owner = ops.reader.getPort(op.id)?.node;
          if (owner) geometry.add(owner);
        }
        break;
      }
      case "connection":
        links.add(op.op === "update" ? op.id : op.record.id);
        break;
    }
  }
  for (const id of geometry) {
    if (!ops.setNode(id)) {
      ops.removeNode(id);
      continue;
    }
    for (const c of ops.reader.connectionsOfNode(id)) links.add(c.id);
  }
  for (const id of records) if (!geometry.has(id)) ops.refreshNodeRecord(id);
  for (const id of links) if (!ops.setConnection(id)) ops.removeConnection(id);
}

/**
 * A route registration changed for `kind`: recompute only that kind's paths (the built-in route modes rule,
 * The rule that route-only edits keep topology). Nodes are untouched; nothing is written to the model.
 */
export function applyRouteChange(ops: SceneOps, kind: string): void {
  for (const id of ops.connectionsOfKind(kind))
    if (!ops.setConnection(id)) ops.removeConnection(id);
}
