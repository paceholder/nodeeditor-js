/**
 * Headless geometry scene (GEO-04, IDX-01 to IDX-04, VIS-03).
 *
 * A derived cache over a graph model: per-node transform, world bounds and anchors,
 * per-connection path geometry, and one spatial index keyed `n:<id>` / `c:<id>`. It is
 * never authoritative. `change` events update only the touched nodes and their incident
 * connections (IDX-02); `reset` and `rebuild()` recompute everything.
 */

import type { ConnectionId, NodeId } from "../../base/ids/ids.js";
import type { GraphReader } from "../../data/model/reader.js";
import type { ConnectionRecord } from "../../data/model/records.js";
import type { EventHub } from "../../edit/events/event-hub.js";
import type { ChangeEvent } from "../../edit/events/types.js";
import type { RouteMode } from "../geometry/connection-paths.js";
import {
  createGeometryRegistry,
  type GeometryRegistry,
} from "../geometry/geometry-registry.js";
import { rectsIntersect } from "../geometry/rect.js";
import type { Point, Rect } from "../geometry/spaces.js";
import { createAabbTree } from "../spatial-index/aabb-tree.js";
import {
  compareKeys,
  type SpatialIndex,
} from "../spatial-index/spatial-index.js";
import {
  type HitCandidate,
  type HitKind,
  type PickOptions,
  pickAt,
} from "./picking.js";
import {
  buildConnectionEntry,
  buildNodeEntry,
  type ConnectionEntry,
  type NodeEntry,
} from "./scene-entries.js";
import { applyChange, type SceneOps } from "./scene-update.js";

export type SceneLayer = "connection" | "node" | "port";

export type SceneItem =
  | { readonly kind: "node"; readonly id: NodeId }
  | { readonly kind: "connection"; readonly id: ConnectionId };

export interface SceneStats {
  /** Node entries computed since creation. */
  readonly nodeRebuilds: number;
  /** Connection paths computed since creation. */
  readonly connectionRebuilds: number;
  /** Calls made to the spatial index (insert, update, remove). */
  readonly indexWrites: number;
}

export interface GeometryScene {
  node(id: NodeId): NodeEntry | undefined;
  connection(id: ConnectionId): ConnectionEntry | undefined;
  /**
   * Culling query: items whose painted (default) or hit bounds intersect `rect`, in paint
   * order (bottom first) so a painter can iterate directly (IDX-03).
   */
  queryRect(rect: Rect<"world">, bounds?: "painted" | "hit"): SceneItem[];
  /** Ordered candidates under `point`, topmost first (GEO-04a). */
  pick(point: Point<"world">, options: PickOptions): HitCandidate[];
  stats(): SceneStats;
  /** Recompute everything from the reader. */
  rebuild(): void;
  /** Stop listening to the model. */
  dispose(): void;
}

export interface GeometrySceneOptions {
  readonly registry?: GeometryRegistry;
  /** Swappable spatial index (IDX-01). Defaults to an AABB tree. */
  readonly index?: SpatialIndex<string>;
  readonly routeMode?: (connection: ConnectionRecord) => RouteMode;
  /** Stroke and arrowhead margin added to path bounds, world units. Default 8. */
  readonly connectionMargin?: number;
  /** Paint layers bottom to top. Default `connection, node, port` (VIS-02). */
  readonly layerOrder?: readonly SceneLayer[];
}

export interface SceneSource {
  readonly reader: GraphReader;
  readonly on: EventHub["on"];
}

const DEFAULT_LAYERS: readonly SceneLayer[] = ["connection", "node", "port"];

export function createGeometryScene(
  source: SceneSource,
  options: GeometrySceneOptions = {},
): GeometryScene {
  const { reader } = source;
  const registry = options.registry ?? createGeometryRegistry();
  const index = options.index ?? createAabbTree<string>();
  const layers = options.layerOrder ?? DEFAULT_LAYERS;
  const margin = options.connectionMargin ?? 8;
  const modeOf = options.routeMode ?? (() => "bezier" as const);
  const nodes = new Map<NodeId, NodeEntry>();
  const connections = new Map<ConnectionId, ConnectionEntry>();
  let maxCapture = 0;
  const stats = { nodeRebuilds: 0, connectionRebuilds: 0, indexWrites: 0 };

  const ops: SceneOps = {
    reader,
    setNode(id) {
      const record = reader.getNode(id);
      if (!record) return false;
      const geometry = registry.get(record.type);
      const entry = buildNodeEntry(
        { node: record, ports: reader.portsOf(id) },
        reader.seqOf(id) ?? 0,
        geometry,
      );
      stats.nodeRebuilds++;
      if (!entry) {
        ops.removeNode(id);
        return true;
      }
      nodes.set(id, entry);
      for (const a of entry.anchors)
        maxCapture = Math.max(maxCapture, a.captureRadiusPx);
      index.update(`n:${id}`, entry.indexBounds);
      stats.indexWrites++;
      return true;
    },
    refreshNodeRecord(id) {
      const entry = nodes.get(id);
      const record = reader.getNode(id);
      if (entry && record) nodes.set(id, { ...entry, record });
    },
    removeNode(id) {
      if (nodes.delete(id)) {
        index.remove(`n:${id}`);
        stats.indexWrites++;
      }
    },
    setConnection(id) {
      const record = reader.getConnection(id);
      if (!record) return false;
      const entry = buildConnectionEntry(
        record,
        reader.seqOf(id) ?? 0,
        (n) => nodes.get(n),
        modeOf(record),
        margin,
      );
      stats.connectionRebuilds++;
      connections.set(id, entry);
      if (entry.paintedBounds) index.update(`c:${id}`, entry.paintedBounds);
      else index.remove(`c:${id}`);
      stats.indexWrites++;
      return true;
    },
    removeConnection(id) {
      if (connections.delete(id)) {
        index.remove(`c:${id}`);
        stats.indexWrites++;
      }
    },
    nodesOfType(type) {
      return [...nodes.values()]
        .filter((e) => e.record.type === type)
        .map((e) => e.id);
    },
  };

  function rebuild(): void {
    nodes.clear();
    connections.clear();
    index.clear();
    maxCapture = 0;
    for (const n of reader.nodes()) ops.setNode(n.id);
    for (const c of reader.connections()) ops.setConnection(c.id);
  }
  rebuild();

  const unsubscribers = [
    source.on("change", (e: ChangeEvent) => applyChange(ops, e)),
    source.on("reset", rebuild),
    registry.onChange((type) => {
      const affected = ops.nodesOfType(type);
      applyChange(ops, undefined, affected);
    }),
  ];

  const layerRank = (kind: "node" | "connection"): number => {
    const i = layers.indexOf(kind);
    return i < 0 ? layers.length : i;
  };

  const pickOrder: readonly HitKind[] = [...layers].reverse();

  return {
    node: (id) => nodes.get(id),
    connection: (id) => connections.get(id),
    queryRect(rect, bounds = "painted") {
      const keys: string[] = [];
      index.queryRect(rect, keys);
      const items: {
        item: SceneItem;
        layer: number;
        z: number;
        seq: number;
      }[] = [];
      for (const key of keys) {
        const id = key.slice(2);
        if (key.startsWith("n:")) {
          const e = nodes.get(id as NodeId);
          const b = e && (bounds === "painted" ? e.paintedBounds : e.hitBounds);
          if (e && b && rectsIntersect(b, rect)) {
            items.push({
              item: { kind: "node", id: e.id },
              layer: layerRank("node"),
              z: e.record.z,
              seq: e.seq,
            });
          }
        } else {
          const e = connections.get(id as ConnectionId);
          if (e?.paintedBounds && rectsIntersect(e.paintedBounds, rect)) {
            items.push({
              item: { kind: "connection", id: e.id },
              layer: layerRank("connection"),
              z: 0,
              seq: e.seq,
            });
          }
        }
      }
      items.sort(
        (a, b) =>
          a.layer - b.layer ||
          a.z - b.z ||
          a.seq - b.seq ||
          compareKeys(a.item.id, b.item.id),
      );
      return items.map((i) => i.item);
    },
    pick: (point, o) =>
      pickAt(
        {
          index,
          node: (id) => nodes.get(id),
          connection: (id) => connections.get(id),
          maxCaptureRadiusPx: () => maxCapture,
          defaultOrder: pickOrder,
        },
        point,
        o,
      ),
    stats: () => ({ ...stats }),
    rebuild,
    dispose() {
      for (const off of unsubscribers) off();
    },
  };
}
