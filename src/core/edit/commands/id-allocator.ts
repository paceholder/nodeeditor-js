/**
 * ID allocation for planners (PAT-04).
 *
 * Wraps the pure generator and a starting cursor. Allocating changes nothing in the
 * model: the advanced cursor travels on the patch and only counts once it is committed.
 */
import type { IdCursor, IdGenerator } from "../../base/ids/id-generator.js";
import {
  type ConnectionId,
  connectionId,
  type NodeId,
  nodeId,
  type PortId,
  portId,
} from "../../base/ids/ids.js";

export interface IdAllocator {
  node(): NodeId;
  port(): PortId;
  connection(): ConnectionId;
  /** Cursor after all allocations, or undefined if nothing was allocated. */
  cursor(): IdCursor | undefined;
}

export function createIdAllocator(
  generator: IdGenerator,
  start: IdCursor,
): IdAllocator {
  let current = start;
  let used = false;
  const take = (kind: "node" | "port" | "connection"): string => {
    const next = generator.next(kind, current);
    current = next.cursor;
    used = true;
    return next.id;
  };
  return {
    node: () => nodeId(take("node")),
    port: () => portId(take("port")),
    connection: () => connectionId(take("connection")),
    cursor: () => (used ? current : undefined),
  };
}
