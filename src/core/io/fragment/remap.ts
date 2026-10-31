/**
 * ID remapping and placement for paste.
 *
 * Fresh IDs come from the plan's allocator in a fixed order: each node in fragment order
 * followed by its ports in presentation order, then the internal connections. The maps
 * are only read by key, never iterated for output. The allocator advances the document
 * cursor, so a retired ID is never handed out again.
 */
import type { ConnectionId, NodeId, PortId } from "../../base/ids/ids.js";
import { MisuseError } from "../../base/result.js";
import type {
  ConnectionRecord,
  Endpoint,
  NodeRecord,
  Payload,
  PortRecord,
} from "../../data/model/records.js";
import type { Vec2 } from "../../data/model/values.js";
import type { IdAllocator } from "../../edit/commands/id-allocator.js";
import type { Placement } from "../../edit/commands/types.js";
import {
  connectionToRecord,
  nodeToRecord,
  portToRecord,
} from "../snapshot/records.js";
import type {
  EndpointSnapshot,
  GraphSnapshot,
} from "../snapshot/snapshot-types.js";
import { boundsCentre, fragmentBounds } from "./bounds.js";

export interface IdMaps {
  readonly nodes: ReadonlyMap<string, NodeId>;
  readonly ports: ReadonlyMap<string, PortId>;
  readonly connections: ReadonlyMap<string, ConnectionId>;
}

export function allocateIds(snapshot: GraphSnapshot, ids: IdAllocator): IdMaps {
  const nodes = new Map<string, NodeId>();
  const ports = new Map<string, PortId>();
  const connections = new Map<string, ConnectionId>();
  for (const node of snapshot.nodes) {
    nodes.set(node.id, ids.node());
    for (const port of node.ports) ports.set(port.id, ids.port());
  }
  for (const c of snapshot.connections) connections.set(c.id, ids.connection());
  return { nodes, ports, connections };
}

/** The new endpoint for an endpoint inside the fragment, or undefined outside it. */
export function remapEndpoint(
  end: EndpointSnapshot,
  maps: IdMaps,
): Endpoint | undefined {
  const node = maps.nodes.get(end.node);
  const port = maps.ports.get(end.port);
  return node && port ? { node, port } : undefined;
}

/** The translation that a placement applies to every node of the fragment. */
export function placementDelta(
  placement: Placement,
  snapshot: GraphSnapshot,
): Vec2 {
  if (placement.kind === "offset") return placement.by;
  const bounds = fragmentBounds(snapshot.nodes);
  if (!bounds) return { x: 0, y: 0 };
  const centre = boundsCentre(bounds);
  return { x: placement.at.x - centre.x, y: placement.at.y - centre.y };
}

export interface RemappedRecords {
  readonly nodes: readonly {
    readonly node: NodeRecord;
    readonly ports: readonly PortRecord[];
  }[];
  readonly connections: readonly ConnectionRecord[];
}

/**
 * Records for the pasted entities: fresh IDs, translated positions, and `z` values from
 * `baseZ` upward in fragment (paint) order, so relative stacking is kept.
 */
export function remapRecords(
  snapshot: GraphSnapshot,
  payloads: readonly Payload[],
  maps: IdMaps,
  delta: Vec2,
  baseZ: number,
): RemappedRecords {
  const need = <T>(value: T | undefined): T => {
    if (value === undefined)
      throw new MisuseError("fragment ID was not allocated");
    return value;
  };
  const nodes = snapshot.nodes.map((entry, i) => {
    const id = need(maps.nodes.get(entry.id));
    const record = nodeToRecord(entry, payloads[i] ?? null);
    const ports = entry.ports.map((p) => ({
      ...portToRecord(p, id),
      id: need(maps.ports.get(p.id)),
    }));
    const node: NodeRecord = {
      ...record,
      id,
      position: {
        x: entry.position.x + delta.x,
        y: entry.position.y + delta.y,
      },
      z: baseZ + i,
      ports: ports.map((p) => p.id),
    };
    return { node, ports };
  });
  const connections = snapshot.connections.map((c) => ({
    ...connectionToRecord(c),
    id: need(maps.connections.get(c.id)),
    from: need(remapEndpoint(c.from, maps)),
    to: need(remapEndpoint(c.to, maps)),
  }));
  return { nodes, connections };
}
