/**
 * Two-phase picking (GEO-04, GEO-04a, GEO-05).
 *
 * Broad phase: a point query on the spatial index with a radius of
 * `max(tolerancePx, largest capture radius) / zoom` world units. Precise phase: port
 * capture distance, node hit shape (the point mapped into node-local space), and path
 * distance. Connections are indexed per piece, so exact distance is measured only on the
 * pieces the broad phase returned, never on a whole long path (PERF-04). Tolerances are CSS pixels and are divided by zoom, so they stay constant on
 * screen. Candidates are ordered by interactive layer (first entry of `order` wins), then
 * by paint order descending (topmost first), then nearest port first, then by ID.
 */

import type { ConnectionId, NodeId, PortId } from "../../base/ids/ids.js";
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
import type { IndexedRef } from "./scene-index.js";

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
  /**
   * Score ports. Default true. A view passes `false` while ports are hidden (zoomed
   * out, LAY-04): capture radii then leave the broad phase and no port is returned.
   */
  readonly ports?: boolean;
}

export interface PickSource {
  readonly index: SpatialIndex<string>;
  /** Entry (and piece) behind an index key. */
  lookup(key: string): IndexedRef | undefined;
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
  const order = options.order ?? source.defaultOrder;
  const rank = (kind: HitKind): number => {
    const i = order.indexOf(kind);
    return i < 0 ? order.length : i;
  };
  const ports = options.ports ?? true;
  const tolerancePx = options.tolerancePx ?? DEFAULT_TOLERANCE_PX;
  const radius =
    (ports ? Math.max(tolerancePx, source.maxCaptureRadiusPx()) : tolerancePx) /
    zoom.value;
  const tolerance = tolerancePx / zoom.value;
  const keys: string[] = [];
  source.index.queryPoint(point, radius, keys);
  keys.sort(compareKeys);

  const found: Scored[] = [];
  // Connections already hit by one of their pieces; the rest of their pieces are skipped.
  const hitConnections = new Set<ConnectionEntry>();
  for (const key of keys) {
    const ref = source.lookup(key);
    if (!ref) continue;
    if (ref.kind === "node") {
      if (ports) scorePorts(ref.entry, point, zoom.value, rank, found);
      scoreBody(ref.entry, point, rank, found);
      continue;
    }
    const entry = ref.entry;
    if (hitConnections.has(entry)) continue;
    const piece = entry.segments[ref.piece];
    if (piece && pathDistance(piece, point) <= tolerance) {
      hitConnections.add(entry);
      found.push(connectionHit(entry, rank));
    }
  }
  return found.sort(compareScored).map((s) => s.hit);
}

function connectionHit(
  entry: ConnectionEntry,
  rank: (kind: HitKind) => number,
): Scored {
  return {
    hit: { kind: "connection", connectionId: entry.id },
    layer: rank("connection"),
    z: 0,
    seq: entry.seq,
    dist: 0,
    tie: entry.id,
  };
}

function scorePorts(
  entry: NodeEntry,
  point: Point<"world">,
  zoom: number,
  rank: (kind: HitKind) => number,
  out: Scored[],
): void {
  for (const a of entry.anchors) {
    const dist = Math.hypot(point.x - a.position.x, point.y - a.position.y);
    if (dist <= a.captureRadiusPx / zoom) {
      out.push({
        hit: { kind: "port", nodeId: entry.id, portId: a.portId },
        layer: rank("port"),
        z: entry.record.z,
        seq: entry.seq,
        dist,
        tie: a.portId,
      });
    }
  }
}

function scoreBody(
  entry: NodeEntry,
  point: Point<"world">,
  rank: (kind: HitKind) => number,
  out: Scored[],
): void {
  if (shapeContains(entry.hitShape, applyPoint(entry.toLocal, point))) {
    out.push({
      hit: { kind: "node", nodeId: entry.id },
      layer: rank("node"),
      z: entry.record.z,
      seq: entry.seq,
      dist: 0,
      tie: entry.id,
    });
  }
}
