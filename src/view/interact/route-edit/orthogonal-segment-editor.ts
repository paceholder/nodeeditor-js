/**
 * Orthogonal segment editor (ROU-03b to ROU-03g, D6, D11, D12): the route editor the
 * library supplies for orthogonal connections. Every segment of the routed path,
 * including the first and the last, has a move handle that is dragged perpendicular to
 * the segment; a long enough segment also has a diamond split handle. A move drag pins
 * the segment (the pin that realizes it is replaced, or a new one is inserted where the
 * walk order of the constraints keeps it). A split drag breaks the segment at the handle
 * into three pins. The port stubs stay fixed: for the first and last segments the router
 * adds the step after the stub. Every drag result drops the pins that change nothing.
 * A double-click on a pinned segment removes only that pin.
 */
import type { ConnectionEntry, RouteConstraint } from "../../../core/index.js";
import type {
  RouteCursor,
  RouteEditor,
} from "../../render/registries/route-editor-registry.js";
import { dropRedundantPins } from "./orthogonal-normalize.js";
import {
  DEFAULT_SPLIT_MIN_PX,
  distanceToSegment,
  insertionIndex,
  moveHandle,
  pinOf,
  type Segment,
  segmentOfHandle,
  segmentsOf,
  splitHandle,
} from "./orthogonal-segments.js";

export interface OrthogonalSegmentEditorOptions {
  /** Shortest on-screen segment length (CSS px) that shows a diamond; default 48. */
  readonly splitMinPx?: number;
}

const EPS = 1e-9;

const pinAt = (
  orientation: RouteConstraint["orientation"],
  at: number,
): RouteConstraint => ({ kind: "segment", orientation, at });

/**
 * `pins` with every pin realized by segment `index` replaced by `fresh` (at the first
 * one's place), or with `fresh` inserted where walk order keeps it when the segment is
 * free.
 */
function withSegmentPins(
  entry: ConnectionEntry,
  index: number,
  fresh: readonly RouteConstraint[],
): RouteConstraint[] {
  const pins = entry.record.route ?? [];
  const first = pinOf(entry, index);
  if (first < 0) {
    const at = insertionIndex(entry, index);
    return [...pins.slice(0, at), ...fresh, ...pins.slice(at)];
  }
  const realized = entry.realized ?? [];
  const out: RouteConstraint[] = [];
  pins.forEach((pin, k) => {
    if (k === first) out.push(...fresh);
    else if (realized[k] !== index) out.push(pin);
  });
  return out;
}

export function createOrthogonalSegmentEditor(
  options: OrthogonalSegmentEditorOptions = {},
): RouteEditor {
  const splitMinPx = options.splitMinPx ?? DEFAULT_SPLIT_MIN_PX;
  const splittable = (s: Segment, zoom: number): boolean =>
    s.length * zoom >= splitMinPx;

  return {
    handles: (entry, view) =>
      segmentsOf(entry).flatMap((s) => [
        moveHandle(entry, s),
        ...(splittable(s, view.zoom) ? [splitHandle(entry, s, view)] : []),
      ]),
    hit(entry, world, tolerance, view) {
      const segments = segmentsOf(entry);
      // Diamonds first (D11): they sit on top of their own segment.
      let diamond: { h: ReturnType<typeof splitHandle>; d: number } | undefined;
      for (const s of segments) {
        if (!splittable(s, view.zoom)) continue;
        const h = splitHandle(entry, s, view);
        const d = Math.hypot(world.x - h.at.x, world.y - h.at.y);
        if (d <= tolerance && (!diamond || d < diamond.d)) diamond = { h, d };
      }
      if (diamond) return diamond.h;
      let best: { segment: Segment; distance: number } | undefined;
      for (const segment of segments) {
        const distance = distanceToSegment(world, segment);
        if (distance <= tolerance && (!best || distance < best.distance)) {
          best = { segment, distance };
        }
      }
      return best && moveHandle(entry, best.segment);
    },
    drag(entry, handle, start, world, context) {
      const pins = entry.record.route ?? [];
      const segment = segmentOfHandle(entry, handle);
      if (!segment) return pins;
      const vertical = segment.orientation === "vertical";
      const delta = vertical ? world.x - start.x : world.y - start.y;
      let fresh: RouteConstraint[];
      if (handle.role === "split") {
        if (Math.abs(delta) < EPS) return pins;
        const across = vertical ? handle.at.y : handle.at.x;
        fresh = [
          pinAt(segment.orientation, segment.at),
          pinAt(vertical ? "horizontal" : "vertical", across),
          pinAt(segment.orientation, segment.at + delta),
        ];
      } else {
        fresh = [pinAt(segment.orientation, segment.at + delta)];
      }
      return dropRedundantPins(
        entry,
        withSegmentPins(entry, segment.index, fresh),
        context,
      );
    },
    activate(entry, handle) {
      if (handle.role === "split") return undefined;
      const segment = segmentOfHandle(entry, handle);
      const k = segment ? pinOf(entry, segment.index) : -1;
      if (k < 0) return undefined;
      return (entry.record.route ?? []).filter((_, i) => i !== k);
    },
    cursor: (handle): RouteCursor =>
      handle.role === "split"
        ? "move"
        : handle.id.startsWith("v")
          ? "ew-resize"
          : "ns-resize",
  };
}
