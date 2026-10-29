/**
 * Two-phase picking.
 *
 * Broad phase: a point query on the spatial index with a radius of
 * `max(tolerancePx, largest capture radius) / zoom` world units. Precise phase: port
 * capture distance, node hit shape (the point mapped into node-local space), and path
 * distance. Tolerances are CSS pixels and are divided by zoom, so they stay constant on
 * screen. Candidates are ordered by interactive layer (first entry of `order` wins), then
 * by paint order descending (topmost first), then nearest port first, then by ID.
 */

import {
  type ConnectionId,
  connectionId,
  type NodeId,
  nodeId,
  type PortId,
} from "../../base/ids/ids.js";
import { applyPoint } from "../geometry/affine.js";
import { clampZoom } from "../geometry/limits.js";
import { pathDistance } from "../geometry/path-geometry.js";
import { shapeContains } from "../geometry/shapes.js";
import type { Point } from "../geometry/spaces.js";
import {
  compareKeys,
  type SpatialIndex,
} from "../spatial-index/spatial-index.js";
import type { ConnectionEntry, NodeEntry } from "./scene-entries.js";

export type HitKind = "port" | "node" | "connection";

/** `member` is reserved for bundled-path members and is never set yet. */
export type HitCandidate =
  | { readonly kind: "port"; readonly nodeId: NodeId; readonly portId: PortId }
  | { readonly kind: "node"; readonly nodeId: NodeId }
  | {
      readonly kind: "connection";
      readonly connectionId: ConnectionId;
      readonly member?: string;
    };

export interface PickOptions {
  /** Current viewport zoom; tolerances are divided by it. */
  readonly zoom: number;
  /** Connection hit distance in CSS pixels. Default 4. */
  readonly tolerancePx?: number;
  /** Interactive order, topmost kind first. Defaults to the scene's order. */
  readonly order?: readonly HitKind[];
}

export interface PickSource {
  readonly index: SpatialIndex<string>;
  node(id: NodeId): NodeEntry | undefined;
  connection(id: ConnectionId): ConnectionEntry | undefined;
  maxCaptureRadiusPx(): number;
  readonly defaultOrder: readonly HitKind[];
}

export const DEFAULT_TOLERANCE_PX = 4;

interface Scored {
  readonly hit: HitCandidate;
  readonly layer: number;
  readonly z: number;
  readonly seq: number;
  readonly dist: number;
  readonly tie: string;
}

function compareScored(a: Scored, b: Scored): number {
  return (
    a.layer - b.layer ||
    b.z - a.z ||
    b.seq - a.seq ||
    a.dist - b.dist ||
    compareKeys(a.tie, b.tie)
  );
}

export function pickAt(
  source: PickSource,
  point: Point<"world">,
  options: PickOptions,
): HitCandidate[] {
  const zoom = clampZoom(options.zoom);
  if (!zoom.ok || !Number.isFinite(point.x) || !Number.isFinite(point.y))
    return [];
  const tolerance = (options.tolerancePx ?? DEFAULT_TOLERANCE_PX) / zoom.value;
  const order = options.order ?? source.defaultOrder;
  const rank = (kind: HitKind): number => {
    const i = order.indexOf(kind);
    return i < 0 ? order.length : i;
  };
  const radius =
    Math.max(
      options.tolerancePx ?? DEFAULT_TOLERANCE_PX,
      source.maxCaptureRadiusPx(),
    ) / zoom.value;
  const keys: string[] = [];
  source.index.queryPoint(point, radius, keys);
  keys.sort(compareKeys);

  const found: Scored[] = [];
  for (const key of keys) {
    const id = key.slice(2);
    if (key.startsWith("n:")) {
      const entry = source.node(nodeId(id));
      if (entry) scoreNode(entry, point, zoom.value, rank, found);
    } else {
      const entry = source.connection(connectionId(id));
      if (entry?.path && pathDistance(entry.path, point) <= tolerance) {
        found.push({
          hit: { kind: "connection", connectionId: entry.id },
          layer: rank("connection"),
          z: 0,
          seq: entry.seq,
          dist: 0,
          tie: entry.id,
        });
      }
    }
  }
  return found.sort(compareScored).map((s) => s.hit);
}

function scoreNode(
  entry: NodeEntry,
  point: Point<"world">,
  zoom: number,
  rank: (kind: HitKind) => number,
  out: Scored[],
): void {
  const z = entry.record.z;
  for (const a of entry.anchors) {
    const dist = Math.hypot(point.x - a.position.x, point.y - a.position.y);
    if (dist <= a.captureRadiusPx / zoom) {
      out.push({
        hit: { kind: "port", nodeId: entry.id, portId: a.portId },
        layer: rank("port"),
        z,
        seq: entry.seq,
        dist,
        tie: a.portId,
      });
    }
  }
  if (shapeContains(entry.hitShape, applyPoint(entry.toLocal, point))) {
    out.push({
      hit: { kind: "node", nodeId: entry.id },
      layer: rank("node"),
      z,
      seq: entry.seq,
      dist: 0,
      tie: entry.id,
    });
  }
}
