/** Record builders shared by model tests. */
import { connectionId, nodeId, portId } from "../../base/ids/ids.js";
import type { ConnectionRecord, NodeRecord, PortRecord } from "./records.js";

export function mkNode(id: string, over: Partial<NodeRecord> = {}): NodeRecord {
  return {
    id: nodeId(id),
    type: "t",
    position: { x: 0, y: 0 },
    size: { width: 10, height: 10 },
    rotation: 0,
    mirrored: false,
    z: 0,
    ports: [],
    payload: null,
    ...over,
  };
}

export function mkPort(
  id: string,
  node: string,
  over: Partial<PortRecord> = {},
): PortRecord {
  return {
    id: portId(id),
    node: nodeId(node),
    direction: "undirected",
    typeKey: "k",
    limit: "unlimited",
    ...over,
  };
}

export function mkConn(
  id: string,
  fromNode: string,
  fromPort: string,
  toNode: string,
  toPort: string,
): ConnectionRecord {
  return {
    id: connectionId(id),
    kind: "default",
    from: { node: nodeId(fromNode), port: portId(fromPort) },
    to: { node: nodeId(toNode), port: portId(toPort) },
  };
}
