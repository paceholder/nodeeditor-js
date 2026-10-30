/**
 * Culling query in paint order.
 *
 * Index keys resolve through the key table, connection pieces are de-duplicated, and
 * rows go into one array per layer sorted numerically by `(z, seq)`. The model allocates
 * `seq` from one counter, but a patch may pass its own, so the ID tie-break stays as a
 * fallback; it is only reached when `z` and `seq` both tie. When the rectangle contains
 * every indexed box (fit-all), the result is cached until the next index write.
 */

import type { ConnectionId, NodeId } from "../../base/ids/ids.js";
import { rectContainsRect, rectsIntersect } from "../geometry/rect.js";
import type { Rect } from "../geometry/spaces.js";
import { compareKeys } from "../spatial-index/spatial-index.js";
import type { ConnectionEntry, NodeEntry } from "./scene-entries.js";
import type { SceneIndex } from "./scene-index.js";

export type SceneItem =
  | { readonly kind: "node"; readonly id: NodeId }
  | { readonly kind: "connection"; readonly id: ConnectionId };

export type QueryBounds = "painted" | "hit";

export interface SceneQuery {
  queryRect(rect: Rect<"world">, bounds: QueryBounds): SceneItem[];
}

const byNodeOrder = (a: NodeEntry, b: NodeEntry): number =>
  a.record.z - b.record.z || a.seq - b.seq || compareKeys(a.id, b.id);

const byConnectionOrder = (a: ConnectionEntry, b: ConnectionEntry): number =>
  a.seq - b.seq || compareKeys(a.id, b.id);

const nodeItem = (e: NodeEntry): SceneItem => ({ kind: "node", id: e.id });
const connectionItem = (e: ConnectionEntry): SceneItem => ({
  kind: "connection",
  id: e.id,
});

/**
 * De-duplication without a set: the index returns every piece whose box meets `r`, so a
 * path is kept only for the lowest-numbered such piece.
 */
function firstPieceIn(
  e: ConnectionEntry,
  piece: number,
  r: Rect<"world">,
): boolean {
  for (let i = 0; i < piece; i++) {
    const box = e.segmentBounds[i];
    if (box && rectsIntersect(box, r)) return false;
  }
  return true;
}

const SLOT = 2 ** 21;
const MAX_PACKED_SEQ = 2 ** 31;

/**
 * Connections in `(seq, id)` order. Each `seq` is packed with the row number into one
 * float (`seq * 2^21 + row`, exact below 2^52) and the floats are sorted natively, which
 * is several times faster than a comparator sort. Runs of equal `seq` are then ordered by
 * ID. Out-of-range input falls back to the comparator.
 */
function sortConnections(list: ConnectionEntry[]): ConnectionEntry[] {
  const n = list.length;
  if (n > SLOT) return list.sort(byConnectionOrder);
  const packed = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const seq = (list[i] as ConnectionEntry).seq;
    if (!Number.isInteger(seq) || seq < 0 || seq >= MAX_PACKED_SEQ)
      return list.sort(byConnectionOrder);
    packed[i] = seq * SLOT + i;
  }
  packed.sort();
  const out: ConnectionEntry[] = new Array(n);
  for (let i = 0; i < n; i++)
    out[i] = list[(packed[i] as number) % SLOT] as ConnectionEntry;
  for (let i = 1; i < n; i++) {
    if ((out[i] as ConnectionEntry).seq !== (out[i - 1] as ConnectionEntry).seq)
      continue;
    let end = i + 1;
    while (
      end < n &&
      (out[end] as ConnectionEntry).seq === (out[i] as ConnectionEntry).seq
    )
      end++;
    const run = out.slice(i - 1, end).sort(byConnectionOrder);
    out.splice(i - 1, run.length, ...run);
    i = end - 1;
  }
  return out;
}

/** `nodeRank` / `connectionRank` are the layers' positions, bottom first. */
export function createSceneQuery(
  index: SceneIndex,
  nodeRank: number,
  connectionRank: number,
): SceneQuery {
  let cache:
    | { version: number; bounds: QueryBounds; items: SceneItem[] }
    | undefined;

  function compute(r: Rect<"world">, bounds: QueryBounds): SceneItem[] {
    const keys: string[] = [];
    index.spatial.queryRect(r, keys);
    const nodes: NodeEntry[] = [];
    const conns: ConnectionEntry[] = [];
    for (const key of keys) {
      const ref = index.lookup(key);
      if (!ref) continue;
      if (ref.kind === "node") {
        const e = ref.entry;
        const b = bounds === "painted" ? e.paintedBounds : e.hitBounds;
        if (rectsIntersect(b, r)) nodes.push(e);
      } else {
        const e = ref.entry;
        if (firstPieceIn(e, ref.piece, r) && e.paintedBounds)
          if (rectsIntersect(e.paintedBounds, r)) conns.push(e);
      }
    }
    nodes.sort(byNodeOrder);
    const sorted = sortConnections(conns);
    if (nodeRank === connectionRank) return mergeEqualRank(nodes, sorted);
    const ns = nodes.map(nodeItem);
    const cs = sorted.map(connectionItem);
    return nodeRank < connectionRank ? ns.concat(cs) : cs.concat(ns);
  }

  return {
    queryRect(r, bounds) {
      const extent = index.extent();
      const full = extent !== undefined && rectContainsRect(r, extent);
      if (!full) return compute(r, bounds);
      const version = index.version();
      if (cache?.version !== version || cache.bounds !== bounds)
        cache = { version, bounds, items: compute(r, bounds) };
      return cache.items.slice();
    },
  };
}

/** Neither kind has a configured layer: order both together by `(z, seq, id)`. */
function mergeEqualRank(
  nodes: readonly NodeEntry[],
  conns: readonly ConnectionEntry[],
): SceneItem[] {
  const rows = [
    ...nodes.map((e) => ({ item: nodeItem(e), z: e.record.z, seq: e.seq })),
    ...conns.map((e) => ({ item: connectionItem(e), z: 0, seq: e.seq })),
  ];
  rows.sort(
    (a, b) => a.z - b.z || a.seq - b.seq || compareKeys(a.item.id, b.item.id),
  );
  return rows.map((row) => row.item);
}
