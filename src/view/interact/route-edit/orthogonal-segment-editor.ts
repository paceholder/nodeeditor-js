/**
 * Orthogonal segment editor (ROU-03b, ROU-03c, ROU-03d, D6): the route editor the library
 * supplies for orthogonal connections. Every inner segment of the routed path (all but the
 * first and the last) is a handle, dragged perpendicular to its direction. A drag pins the
 * segment: it replaces the pin that realizes the segment, or inserts a new pin where the
 * walk order of the constraints keeps it. A double-click on a pinned segment removes only
 * that pin. Handle ids are `v:<index>` or `h:<index>`: orientation and segment index in
 * `polylineVertices(path)`, the indexing `ConnectionEntry.realized` uses.
 */
import {
  type ConnectionEntry,
  type Point,
  polylineVertices,
  type RouteConstraint,
} from "../../../core/index.js";
import type {
  RouteCursor,
  RouteEditor,
  RouteHandle,
} from "../../render/registries/route-editor-registry.js";

type W = "world";

interface Segment {
  readonly index: number;
  readonly orientation: RouteConstraint["orientation"];
  /** World x of a vertical segment, world y of a horizontal one. */
  readonly at: number;
  readonly a: Point<W>;
  readonly b: Point<W>;
}

const EPS = 1e-9;

/** The draggable segments of a connection: axis-aligned, non-empty, neither end one. */
function innerSegments(entry: ConnectionEntry): Segment[] {
  const path = entry.path;
  if (path?.kind !== "polyline") return [];
  const v = polylineVertices(path);
  const out: Segment[] = [];
  for (let i = 1; i < v.length - 2; i++) {
    const a = v[i] as Point<W>;
    const b = v[i + 1] as Point<W>;
    const vertical = Math.abs(a.x - b.x) < EPS;
    const horizontal = Math.abs(a.y - b.y) < EPS;
    if (vertical === horizontal) continue;
    out.push({
      index: i,
      orientation: vertical ? "vertical" : "horizontal",
      at: vertical ? a.x : a.y,
      a,
      b,
    });
  }
  return out;
}

const idOf = (s: Segment): string =>
  `${s.orientation === "vertical" ? "v" : "h"}:${s.index}`;

function handleOf(s: Segment, pinned: boolean): RouteHandle {
  return {
    id: idOf(s),
    at: { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 },
    pinned,
  };
}

function segmentOf(
  entry: ConnectionEntry,
  handle: RouteHandle,
): Segment | undefined {
  return innerSegments(entry).find((s) => idOf(s) === handle.id);
}

function distanceToSegment(p: Point<W>, s: Segment): number {
  const dx = s.b.x - s.a.x;
  const dy = s.b.y - s.a.y;
  const t = Math.max(
    0,
    Math.min(
      1,
      ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / (dx * dx + dy * dy),
    ),
  );
  return Math.hypot(p.x - (s.a.x + t * dx), p.y - (s.a.y + t * dy));
}

/** Index of the pin that segment `index` realizes, or -1 when the segment is free. */
const pinOf = (entry: ConnectionEntry, index: number): number =>
  entry.realized?.indexOf(index) ?? -1;

/** Where a new pin for segment `index` goes so the constraints stay in walk order. */
function insertionIndex(entry: ConnectionEntry, index: number): number {
  let at = 0;
  (entry.realized ?? []).forEach((segment, k) => {
    if (segment >= 0 && segment < index) at = k + 1;
  });
  return at;
}

export function createOrthogonalSegmentEditor(): RouteEditor {
  return {
    handles: (entry) =>
      innerSegments(entry).map((s) => handleOf(s, pinOf(entry, s.index) >= 0)),
    hit(entry, world, tolerance) {
      let best: { segment: Segment; distance: number } | undefined;
      for (const segment of innerSegments(entry)) {
        const distance = distanceToSegment(world, segment);
        if (distance <= tolerance && (!best || distance < best.distance)) {
          best = { segment, distance };
        }
      }
      return (
        best && handleOf(best.segment, pinOf(entry, best.segment.index) >= 0)
      );
    },
    drag(entry, handle, start, world) {
      const pins = entry.record.route ?? [];
      const segment = segmentOf(entry, handle);
      if (!segment) return pins;
      const delta =
        segment.orientation === "vertical"
          ? world.x - start.x
          : world.y - start.y;
      const pin: RouteConstraint = {
        kind: "segment",
        orientation: segment.orientation,
        at: segment.at + delta,
      };
      const k = pinOf(entry, segment.index);
      if (k >= 0) return pins.map((p, i) => (i === k ? pin : p));
      const at = insertionIndex(entry, segment.index);
      return [...pins.slice(0, at), pin, ...pins.slice(at)];
    },
    activate(entry, handle) {
      const segment = segmentOf(entry, handle);
      const k = segment ? pinOf(entry, segment.index) : -1;
      if (k < 0) return undefined;
      return (entry.record.route ?? []).filter((_, i) => i !== k);
    },
    cursor: (handle): RouteCursor =>
      handle.id.startsWith("v") ? "ew-resize" : "ns-resize",
  };
}
