/**
 * The geometry scene's spatial index plus its key table (PERF-04, IDX-02).
 *
 * Nodes are indexed as `n:<id>` and each connection piece as `c:<id>#<i>`. Keys map
 * straight to their entry, so queries never parse key strings. Every write bumps
 * `version`, which keys result caches. `extent` is a box containing every indexed box,
 * kept tight lazily: it grows on insert, and a removal that touched its edge makes the
 * next read recompute it.
 */

import type { NodeId } from "../../base/ids/ids.js";
import { rectContainsRect, unionRects } from "../geometry/rect.js";
import { type Rect, rect } from "../geometry/spaces.js";
import type { SpatialIndex } from "../spatial-index/spatial-index.js";
import type { ConnectionEntry, NodeEntry } from "./scene-entries.js";

export type IndexedRef =
  | { readonly kind: "node"; readonly entry: NodeEntry }
  | {
      readonly kind: "connection";
      readonly entry: ConnectionEntry;
      /** Piece number within `entry.segments`. */
      readonly piece: number;
    };

export interface SceneIndex {
  readonly spatial: SpatialIndex<string>;
  lookup(key: string): IndexedRef | undefined;
  putNode(entry: NodeEntry): void;
  /** Swap in an entry whose bounds are unchanged (record-only refresh). */
  refreshNode(entry: NodeEntry): void;
  removeNode(id: NodeId): void;
  /** Index `entry`'s pieces, removing pieces of `previous` beyond the new count. */
  putConnection(entry: ConnectionEntry, previous?: ConnectionEntry): void;
  removeConnection(entry: ConnectionEntry): void;
  clear(): void;
  /** Bumped by every write and refresh. */
  version(): number;
  /** Calls made to the spatial index (insert, update, remove). */
  writes(): number;
  /** Union of all indexed boxes, undefined when empty. */
  extent(): Rect<"world"> | undefined;
}

const boxOf = (ref: IndexedRef): Rect<"world"> | undefined =>
  ref.kind === "node"
    ? ref.entry.indexBounds
    : ref.entry.segmentBounds[ref.piece];

const touchesEdge = (outer: Rect<"world">, inner: Rect<"world">): boolean =>
  inner.x <= outer.x ||
  inner.y <= outer.y ||
  inner.x + inner.w >= outer.x + outer.w ||
  inner.y + inner.h >= outer.y + outer.h;

/** Union of the boxes behind `refs`; min/max are order-independent (MOD-08). */
function exactExtent(refs: Iterable<IndexedRef>): Rect<"world"> | undefined {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const ref of refs) {
    const b = boxOf(ref);
    if (!b) continue;
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  return minX <= maxX ? rect(minX, minY, maxX - minX, maxY - minY) : undefined;
}

export const pieceKey = (id: string, piece: number): string =>
  `c:${id}#${piece}`;

export function createSceneIndex(spatial: SpatialIndex<string>): SceneIndex {
  const refs = new Map<string, IndexedRef>();
  let version = 0;
  let writes = 0;
  let extent: Rect<"world"> | undefined;
  let extentExact = true;

  function put(key: string, ref: IndexedRef, box: Rect<"world">): void {
    const old = refs.get(key);
    if (old) shrinkFrom(old);
    refs.set(key, ref);
    spatial.update(key, box);
    writes++;
    version++;
    if (!extent) extent = box;
    else if (!rectContainsRect(extent, box)) extent = unionRects(extent, box);
  }

  function shrinkFrom(old: IndexedRef): void {
    const box = boxOf(old);
    if (extent && box && touchesEdge(extent, box)) extentExact = false;
  }

  function drop(key: string): void {
    const old = refs.get(key);
    if (!old) return;
    shrinkFrom(old);
    refs.delete(key);
    spatial.remove(key);
    writes++;
    version++;
  }

  return {
    spatial,
    lookup: (key) => refs.get(key),
    putNode(entry) {
      put(`n:${entry.id}`, { kind: "node", entry }, entry.indexBounds);
    },
    refreshNode(entry) {
      refs.set(`n:${entry.id}`, { kind: "node", entry });
      version++;
    },
    removeNode(id) {
      drop(`n:${id}`);
    },
    putConnection(entry, previous) {
      entry.segmentBounds.forEach((box, piece) => {
        put(
          pieceKey(entry.id, piece),
          { kind: "connection", entry, piece },
          box,
        );
      });
      const stale = previous?.segmentBounds.length ?? 0;
      for (let i = entry.segmentBounds.length; i < stale; i++)
        drop(pieceKey(entry.id, i));
    },
    removeConnection(entry) {
      for (let i = 0; i < entry.segmentBounds.length; i++)
        drop(pieceKey(entry.id, i));
    },
    clear() {
      refs.clear();
      spatial.clear();
      extent = undefined;
      extentExact = true;
      version++;
    },
    version: () => version,
    writes: () => writes,
    extent() {
      if (!extentExact) {
        extent = exactExtent(refs.values());
        extentExact = true;
      }
      return extent;
    },
  };
}
