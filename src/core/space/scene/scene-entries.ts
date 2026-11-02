/**
 * Cached per-entity records of the geometry scene (GEO-02a, VIS-03).
 *
 * Entries are derived data: they are rebuilt from model records and geometry
 * registrations and never edited by hand. Every bound here is in world space.
 */

import type { ConnectionId, NodeId, PortId } from "../../base/ids/ids.js";
import type { ConnectionRecord, NodeRecord } from "../../data/model/records.js";
import {
  type Affine2,
  applyPoint,
  applyVector,
  invert,
  isFiniteAffine,
} from "../geometry/affine.js";
import type { NodeGeometry, NodeView } from "../geometry/node-geometry.js";
import { nodeTransform } from "../geometry/node-transform.js";
import {
  isFinitePath,
  type PathGeometry,
  pathBounds,
} from "../geometry/path-geometry.js";
import { controlBounds, splitPath } from "../geometry/path-pieces.js";
import { inflateRect, transformRect, unionRects } from "../geometry/rect.js";
import { type Shape, shapeBounds } from "../geometry/shapes.js";
import type { Point, Rect } from "../geometry/spaces.js";
import type { ConnectionRouter, RouteOutcome } from "../routing/route-types.js";

type W = "world";

export interface WorldAnchor {
  readonly portId: PortId;
  readonly position: Point<W>;
  /** Outward unit normal in world space. */
  readonly normal: Point<W>;
  readonly captureRadiusPx: number;
}

export interface NodeEntry {
  readonly id: NodeId;
  readonly record: NodeRecord;
  /** Insertion sequence; the paint-order tie-break. */
  readonly seq: number;
  readonly toWorld: Affine2<"local", W>;
  readonly toLocal: Affine2<W, "local">;
  /** Hit shape in node-local space. */
  readonly hitShape: Shape;
  readonly bodyBounds: Rect<W>;
  readonly hitBounds: Rect<W>;
  readonly paintedBounds: Rect<W>;
  /** Index bounds: hit and painted bounds together. */
  readonly indexBounds: Rect<W>;
  readonly anchors: readonly WorldAnchor[];
}

export interface ConnectionEntry {
  readonly id: ConnectionId;
  readonly record: ConnectionRecord;
  readonly seq: number;
  /** Undefined when an endpoint has no anchor (the connection is neither painted nor hit). */
  readonly path: PathGeometry | undefined;
  /** How the route turned out (ROU-06); undefined when pathless. */
  readonly route: RouteOutcome | undefined;
  /** Path segment realizing each route constraint, -1 when ignored (ROU-03c). */
  readonly realized?: readonly number[];
  /** Path bounds grown by stroke and arrowhead margins. */
  readonly paintedBounds: Rect<W> | undefined;
  /** The path split into pieces for the spatial index (PERF-04); empty without a path. */
  readonly segments: readonly PathGeometry[];
  /** Index box of each piece: its control-point box grown by the same margin. */
  readonly segmentBounds: readonly Rect<W>[];
}

export function buildNodeEntry(
  view: NodeView,
  seq: number,
  geometry: NodeGeometry,
): NodeEntry | undefined {
  const record = view.node;
  const toWorld = nodeTransform(record);
  const inverse = invert(toWorld);
  if (!inverse.ok || !isFiniteAffine(toWorld)) return undefined;
  const hitShape = geometry.hitShape(view);
  const hitBounds = transformRect(toWorld, shapeBounds(hitShape));
  const paintedBounds = transformRect(toWorld, geometry.paintedBounds(view));
  return {
    id: record.id,
    record,
    seq,
    toWorld,
    toLocal: inverse.value,
    hitShape,
    bodyBounds: transformRect(toWorld, geometry.bodyBounds(view)),
    hitBounds,
    paintedBounds,
    indexBounds: unionRects(hitBounds, paintedBounds),
    anchors: geometry.anchors(view).map((a) => ({
      portId: a.portId,
      position: applyPoint(toWorld, a.position),
      normal: applyVector(toWorld, a.normal),
      captureRadiusPx: a.captureRadiusPx,
    })),
  };
}

export function anchorOf(
  entry: NodeEntry | undefined,
  port: PortId,
): WorldAnchor | undefined {
  return entry?.anchors.find((a) => a.portId === port);
}

export function buildConnectionEntry(
  record: ConnectionRecord,
  seq: number,
  nodes: (id: NodeId) => NodeEntry | undefined,
  router: ConnectionRouter,
  margin: number,
): ConnectionEntry {
  const fromNode = nodes(record.from.node);
  const toNode = nodes(record.to.node);
  const from = anchorOf(fromNode, record.from.port);
  const to = anchorOf(toNode, record.to.port);
  if (!from || !to) {
    return pathless(record, seq);
  }
  const { path, outcome, realized } = router.route({
    from: {
      position: from.position,
      normal: from.normal,
      body: fromNode?.bodyBounds,
    },
    to: { position: to.position, normal: to.normal, body: toNode?.bodyBounds },
    constraints: record.route ?? [],
  });
  if (!isFinitePath(path)) {
    return pathless(record, seq);
  }
  const segments = splitPath(path);
  return {
    id: record.id,
    record,
    seq,
    path,
    route: outcome,
    ...(realized ? { realized } : {}),
    paintedBounds: inflateRect(pathBounds(path), margin),
    segments,
    segmentBounds: segments.map((s) => inflateRect(controlBounds(s), margin)),
  };
}

function pathless(record: ConnectionRecord, seq: number): ConnectionEntry {
  return {
    id: record.id,
    record,
    seq,
    path: undefined,
    route: undefined,
    paintedBounds: undefined,
    segments: [],
    segmentBounds: [],
  };
}
