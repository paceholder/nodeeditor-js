/**
 * Mapping between snapshot entries and model records (SNP-01).
 *
 * Snapshot entries mirror the records, so this is a thin conversion: defaults are filled
 * in on the way to records and omitted again on the way back. Keys are always built in a
 * fixed order, which keeps exported JSON deterministic (SER-06, MOD-08).
 */
import { connectionId, nodeId, portId } from "../../base/ids/ids.js";
import type {
  ConnectionRecord,
  NodeRecord,
  Payload,
  PortRecord,
} from "../../data/model/records.js";
import { cloneJson } from "./json-value.js";
import type {
  ConnectionSnapshot,
  NodeSnapshot,
  PortSnapshot,
} from "./snapshot-types.js";

export function portToRecord(port: PortSnapshot, owner: string): PortRecord {
  return {
    id: portId(port.id),
    node: nodeId(owner),
    direction: port.direction,
    typeKey: port.typeKey,
    limit: port.limit ?? "unlimited",
    ...(port.label === undefined ? {} : { label: port.label }),
    ...(port.placement === undefined
      ? {}
      : { placement: cloneJson(port.placement) }),
  };
}

/** `payload` overrides the snapshot's payload (used after a codec decoded it). */
export function nodeToRecord(
  node: NodeSnapshot,
  payload: Payload = cloneJson(node.payload),
): NodeRecord {
  return {
    id: nodeId(node.id),
    type: node.type,
    position: { x: node.position.x, y: node.position.y },
    size: { width: node.size.width, height: node.size.height },
    rotation: node.rotation ?? 0,
    mirrored: node.mirrored ?? false,
    z: node.z ?? 0,
    ports: node.ports.map((p) => portId(p.id)),
    ...(node.title === undefined ? {} : { title: node.title }),
    ...(node.status === undefined ? {} : { status: node.status }),
    payload,
    ...(node.capabilities === undefined
      ? {}
      : { capabilities: { ...node.capabilities } }),
  };
}

export function connectionToRecord(c: ConnectionSnapshot): ConnectionRecord {
  return {
    id: connectionId(c.id),
    kind: c.kind ?? "default",
    from: { node: nodeId(c.from.node), port: portId(c.from.port) },
    to: { node: nodeId(c.to.node), port: portId(c.to.port) },
  };
}

export function portToSnapshot(port: PortRecord): PortSnapshot {
  return {
    id: port.id,
    direction: port.direction,
    typeKey: port.typeKey,
    ...(port.limit === "unlimited" ? {} : { limit: port.limit }),
    ...(port.label === undefined ? {} : { label: port.label }),
    ...(port.placement === undefined
      ? {}
      : {
          placement: {
            x: port.placement.x,
            y: port.placement.y,
            ...(port.placement.normal === undefined
              ? {}
              : {
                  normal: {
                    x: port.placement.normal.x,
                    y: port.placement.normal.y,
                  },
                }),
          },
        }),
  };
}

export function nodeToSnapshot(
  node: NodeRecord,
  ports: readonly PortRecord[],
): NodeSnapshot {
  return {
    id: node.id,
    type: node.type,
    position: { x: node.position.x, y: node.position.y },
    size: { width: node.size.width, height: node.size.height },
    ...(node.rotation === 0 ? {} : { rotation: node.rotation }),
    ...(node.mirrored ? { mirrored: true } : {}),
    ...(node.z === 0 ? {} : { z: node.z }),
    ...(node.title === undefined ? {} : { title: node.title }),
    ...(node.status === undefined ? {} : { status: node.status }),
    ...(node.capabilities === undefined
      ? {}
      : { capabilities: { ...node.capabilities } }),
    ports: ports.map(portToSnapshot),
    payload: node.payload,
  };
}

export function connectionToSnapshot(c: ConnectionRecord): ConnectionSnapshot {
  return {
    id: c.id,
    ...(c.kind === "default" ? {} : { kind: c.kind }),
    from: { node: c.from.node, port: c.from.port },
    to: { node: c.to.node, port: c.to.port },
  };
}
