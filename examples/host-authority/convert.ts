/**
 * Conversion between the store's format and the editor's.
 *
 * The store keeps its own two lists; the host turns them into a library snapshot for every
 * push and turns endpoints back into pin references for store calls. The library document
 * format is never stored.
 */
import {
  createNodeTypeRegistry,
  type Endpoint,
  type GraphSnapshot,
  type NodeTypeRegistry,
  SNAPSHOT_FORMAT,
} from "@paceholder/nodeeditor-js";
import type { PinRef, StoreDocument, StoredPin } from "./store.js";

/** Every node of this store is drawn at one size; the store keeps no sizes. */
const SIZE = { width: 80, height: 40 } as const;

/** The node kinds the store offers, registered so the editor can paint and connect them. */
export function storeRegistry(): NodeTypeRegistry {
  const registry = createNodeTypeRegistry();
  for (const [type, label] of [
    ["source", "Source"],
    ["relay", "Relay"],
    ["sink", "Sink"],
  ] as const) {
    // The host names nodes and pins, so the `ports` factory never runs for a creation;
    // the snapshot brings each node's ports.
    registry.register({ type, label, defaultSize: SIZE, ports: () => [] });
  }
  return registry;
}

const portOf = (pin: StoredPin) => ({
  id: pin.id,
  direction: pin.dir === "in" ? ("input" as const) : ("output" as const),
  typeKey: "flow",
});

export function toSnapshot(doc: StoreDocument): GraphSnapshot {
  return {
    format: SNAPSHOT_FORMAT,
    version: 1,
    nodes: doc.nodes.map((n) => ({
      id: n.id,
      type: n.kind,
      position: { x: n.x, y: n.y },
      size: SIZE,
      title: n.label,
      ports: n.pins.map(portOf),
      payload: null,
    })),
    // A link runs from an output pin (`a`) to an input pin (`b`).
    connections: doc.links.map((l) => ({
      id: l.id,
      from: { node: l.a.node, port: l.a.pin },
      to: { node: l.b.node, port: l.b.pin },
    })),
  };
}

export const pinOf = (end: Endpoint): PinRef => ({
  node: end.node,
  pin: end.port,
});
