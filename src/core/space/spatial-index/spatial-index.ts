/**
 * Spatial index contract.
 *
 * Implementations are swappable behind this interface. Queries are inclusive of touching
 * boundaries. Query result ORDER is unspecified (it follows internal layout); consumers
 * that paint or pick sort the keys with `compareKeys`, which is independent of insertion
 * history.
 */
import type { Point, Rect } from "../geometry/spaces.js";

export interface SpatialIndex<K extends string> {
  /** Add an entry. Inserting an existing key behaves like `update`. */
  insert(key: K, bounds: Rect<"world">): void;
  /** Move an entry; inserts when the key is unknown. */
  update(key: K, bounds: Rect<"world">): void;
  /** Remove an entry; unknown keys are ignored. */
  remove(key: K): void;
  /** Append every key whose bounds intersect `r` to `out`. */
  queryRect(r: Rect<"world">, out: K[]): void;
  /** Append every key whose bounds grown by `radius` contain `p` to `out`. */
  queryPoint(p: Point<"world">, radius: number, out: K[]): void;
  readonly size: number;
  clear(): void;
}

/** Code-unit string comparison, stable across runtimes and locales. */
export function compareKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function sortKeys<K extends string>(keys: K[]): K[] {
  return keys.sort(compareKeys);
}
