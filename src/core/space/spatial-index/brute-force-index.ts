/** Reference implementation of `SpatialIndex`: a linear scan. For tests and tiny graphs. */
import { rectsIntersect } from "../geometry/rect.js";
import type { Rect } from "../geometry/spaces.js";
import type { SpatialIndex } from "./spatial-index.js";

export function createBruteForceIndex<K extends string>(): SpatialIndex<K> {
  const entries = new Map<K, Rect<"world">>();
  return {
    insert: (key, bounds) => void entries.set(key, bounds),
    update: (key, bounds) => void entries.set(key, bounds),
    remove: (key) => void entries.delete(key),
    queryRect(r, out) {
      for (const [key, b] of entries) if (rectsIntersect(b, r)) out.push(key);
    },
    queryPoint(p, radius, out) {
      const probe: Rect<"world"> = {
        x: p.x - radius,
        y: p.y - radius,
        w: 2 * radius,
        h: 2 * radius,
      };
      for (const [key, b] of entries) {
        if (rectsIntersect(b, probe)) out.push(key);
      }
    },
    get size() {
      return entries.size;
    },
    clear: () => entries.clear(),
  };
}
