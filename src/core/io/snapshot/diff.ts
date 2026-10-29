/**
 * Snapshot diff (building block for snapshot synchronization).
 *
 * `diffSnapshot(from, to)` returns the patch that turns the current read model into the
 * target snapshot, in one linear pass. Operation order: remove absent connections, remove
 * absent ports, remove absent nodes, add nodes, add ports, update surviving nodes and
 * ports, update surviving connections in place (they keep their ID), add connections.
 * Integrity is checked on the final staged state, so the order only has to keep removes
 * ahead of re-adds of the same ID. Removes carry the current record and `seq`.
 *
 * `to` must be a validated snapshot (`validateSnapshot`). Added entities get fresh `seq`
 * values when the patch is applied, so they sort after existing ones; paint order is
 * still driven by `z`. Order among equal-`z` nodes is not represented by any patch field
 * and is therefore not diffed.
 */
import type { ConnectionId, NodeId, PortId } from "../../base/ids/ids.js";
import type { GraphReader } from "../../data/model/reader.js";
import type { Payload } from "../../data/model/records.js";
import type {
  ConnectionFieldChanges,
  NodeFieldChanges,
  Patch,
  PatchOp,
  PortFieldChanges,
} from "../../data/patch/types.js";
import { cloneJson, jsonEqual } from "./json-value.js";
import { connectionToRecord, nodeToRecord, portToRecord } from "./records.js";
import type { GraphSnapshot, PortSnapshot } from "./snapshot-types.js";

type Changes = Record<string, { old?: unknown; new?: unknown }>;

/** Old/new pairs for the listed fields that differ; undefined when none do. */
function diffFields(
  current: object,
  wanted: object,
  keys: readonly string[],
): Changes | undefined {
  const out: Changes = {};
  for (const key of keys) {
    const was = (current as Record<string, unknown>)[key];
    const now = (wanted as Record<string, unknown>)[key];
    if (jsonEqual(was, now)) continue;
    out[key] = {
      ...(was === undefined ? {} : { old: was }),
      ...(now === undefined ? {} : { new: cloneJson(now) }),
    };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

const NODE_KEYS = [
  "type",
  "position",
  "size",
  "rotation",
  "mirrored",
  "z",
  "title",
  "status",
  "capabilities",
  "ports",
  "payload",
] as const;
const PORT_KEYS = [
  "direction",
  "typeKey",
  "limit",
  "label",
  "placement",
] as const;
const CONNECTION_KEYS = ["kind", "from", "to"] as const;

export function diffSnapshot(from: GraphReader, to: GraphSnapshot): Patch {
  const wantNodes = new Map(to.nodes.map((n) => [n.id, n]));
  const wantConnections = new Map(to.connections.map((c) => [c.id, c]));
  const wantPorts = new Map<string, { port: PortSnapshot; owner: string }>();
  for (const n of to.nodes) {
    for (const port of n.ports) wantPorts.set(port.id, { port, owner: n.id });
  }

  const removals: PatchOp[] = [];
  const adds: PatchOp[] = [];
  const updates: PatchOp[] = [];
  const connectionUpdates: PatchOp[] = [];
  const connectionAdds: PatchOp[] = [];
  const seq = (id: NodeId | PortId | ConnectionId): number =>
    from.seqOf(id) ?? 0;

  for (const c of from.connections()) {
    if (!wantConnections.has(c.id)) {
      removals.push({
        op: "remove",
        entity: "connection",
        record: c,
        seq: seq(c.id),
      });
    }
  }
  for (const p of from.ports()) {
    if (wantPorts.get(p.id)?.owner !== p.node) {
      removals.push({
        op: "remove",
        entity: "port",
        record: p,
        seq: seq(p.id),
      });
    }
  }
  for (const n of from.nodes()) {
    if (!wantNodes.has(n.id)) {
      removals.push({
        op: "remove",
        entity: "node",
        record: n,
        seq: seq(n.id),
      });
    }
  }

  const portAdds: PatchOp[] = [];
  for (const snap of to.nodes) {
    const current = from.getNode(snap.id as NodeId);
    if (!current) {
      adds.push({ op: "add", entity: "node", record: nodeToRecord(snap) });
    } else {
      const fields = diffFields(
        current,
        nodeToRecord(snap, snap.payload as Payload),
        NODE_KEYS,
      );
      if (fields) {
        updates.push({
          op: "update",
          entity: "node",
          id: current.id,
          fields: fields as NodeFieldChanges,
        });
      }
    }
    for (const port of snap.ports) {
      const existing = from.getPort(port.id as PortId);
      const wanted = portToRecord(port, snap.id);
      if (existing?.node !== wanted.node) {
        portAdds.push({ op: "add", entity: "port", record: wanted });
        continue;
      }
      const fields = diffFields(existing, wanted, PORT_KEYS);
      if (fields) {
        updates.push({
          op: "update",
          entity: "port",
          id: existing.id,
          fields: fields as PortFieldChanges,
        });
      }
    }
  }

  for (const snap of to.connections) {
    const current = from.getConnection(snap.id as ConnectionId);
    const wanted = connectionToRecord(snap);
    if (!current) {
      connectionAdds.push({ op: "add", entity: "connection", record: wanted });
      continue;
    }
    const fields = diffFields(current, wanted, CONNECTION_KEYS);
    if (fields) {
      connectionUpdates.push({
        op: "update",
        entity: "connection",
        id: current.id,
        fields: fields as ConnectionFieldChanges,
      });
    }
  }

  const ops = [
    ...removals,
    ...adds,
    ...portAdds,
    ...updates,
    ...connectionUpdates,
    ...connectionAdds,
  ];
  return to.idCursor ? { ops, idCursor: to.idCursor } : { ops };
}
