/**
 * Segments of an orthogonal route as the segment editor sees them (D6, D11): geometry
 * of the routed path, handle ids, and the walk-order helpers for pins. Ids are
 * `v:<i>` / `h:<i>` for a move handle and `sv:<i>` / `sh:<i>` for a split handle:
 * orientation and segment index in `polylineVertices(path)`, the indexing
 * `ConnectionEntry.realized` uses.
 */
import {
  type ConnectionEntry,
  type Point,
  polylineVertices,
  type RouteConstraint,
} from "../../../core/index.js";
import type {
  RouteHandle,
  RouteView,
} from "../../render/registries/route-editor-registry.js";

type W = "world";

export interface Segment {
  readonly index: number;
  readonly orientation: RouteConstraint["orientation"];
  /** World x of a vertical segment, world y of a horizontal one. */
  readonly at: number;
  readonly a: Point<W>;
  readonly b: Point<W>;
  readonly length: number;
}

/** Screen pixels from the square to the diamond along the segment (D11). */
export const SPLIT_OFFSET_PX = 16;
/** Segments shorter than this on screen show no diamond (D11). */
export const DEFAULT_SPLIT_MIN_PX = 48;

const EPS = 1e-9;

/** The axis-aligned, non-empty segments of a connection's routed path, first to last. */
export function segmentsOf(entry: ConnectionEntry): Segment[] {
  const path = entry.path;
  if (path?.kind !== "polyline") return [];
  const v = polylineVertices(path);
  const out: Segment[] = [];
  for (let i = 0; i + 1 < v.length; i++) {
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
      length: Math.hypot(b.x - a.x, b.y - a.y),
    });
  }
  return out;
}

const letter = (s: Segment): string =>
  s.orientation === "vertical" ? "v" : "h";
export const moveId = (s: Segment): string => `${letter(s)}:${s.index}`;
export const splitId = (s: Segment): string => `s${letter(s)}:${s.index}`;

/** Index of the pin that segment `index` realizes, or -1 when the segment is free. */
export const pinOf = (entry: ConnectionEntry, index: number): number =>
  entry.realized?.indexOf(index) ?? -1;

/** Where a new pin for segment `index` goes so the constraints stay in walk order. */
export function insertionIndex(entry: ConnectionEntry, index: number): number {
  let at = 0;
  (entry.realized ?? []).forEach((segment, k) => {
    if (segment >= 0 && segment < index) at = k + 1;
  });
  return at;
}

export function moveHandle(entry: ConnectionEntry, s: Segment): RouteHandle {
  return {
    id: moveId(s),
    at: { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 },
    pinned: pinOf(entry, s.index) >= 0,
    role: "move",
  };
}

/** The diamond sits `SPLIT_OFFSET_PX` from the square toward the segment's later end. */
export function splitHandle(
  entry: ConnectionEntry,
  s: Segment,
  view: RouteView,
): RouteHandle {
  const mid = moveHandle(entry, s).at;
  const k = SPLIT_OFFSET_PX / view.zoom / s.length;
  return {
    id: splitId(s),
    at: { x: mid.x + (s.b.x - s.a.x) * k, y: mid.y + (s.b.y - s.a.y) * k },
    pinned: false,
    role: "split",
  };
}

/** The segment a handle id names, in the current path. */
export function segmentOfHandle(
  entry: ConnectionEntry,
  handle: RouteHandle,
): Segment | undefined {
  const index = Number(handle.id.slice(handle.id.indexOf(":") + 1));
  return segmentsOf(entry).find((s) => s.index === index);
}

export function distanceToSegment(p: Point<W>, s: Segment): number {
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
