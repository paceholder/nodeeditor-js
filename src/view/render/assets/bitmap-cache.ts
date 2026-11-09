/**
 * Bitmap cache: least-recently-used eviction under a byte budget.
 * Evicted and cleared bitmaps are `close()`d so their memory is returned at once.
 * Pinned bitmaps (what the last painted frame and the one being painted draw) are never
 * evicted, so a visible set larger than the budget stays over budget instead of
 * thrashing. Two frames, because results arrive between frames and the next frame draws
 * the same set again. Generic over
 * `CachedBitmap`, so Node tests can use fake bitmaps.
 */
import type { CachedBitmap } from "./asset-types.js";

export const DEFAULT_BUDGET_BYTES = 64 * 1024 * 1024;

export interface BitmapCache<B extends CachedBitmap> {
  /** The bitmap, marked most recently used. */
  get(key: string): B | undefined;
  /** Presence check that does not change recency. */
  has(key: string): boolean;
  /** Remove and close one entry, if present. */
  delete(key: string): void;
  /**
   * Insert (replacing and closing any previous entry), then evict unpinned bitmaps down to
   * budget. The new bitmap itself is never evicted by its own insertion.
   */
  set(key: string, bitmap: B): void;
  /** Keep a cached bitmap from eviction for this frame and the next; no-op if absent. */
  pin(key: string): void;
  /** A frame was painted: pins from the frame before it lapse. */
  endFrame(): void;
  /** Bytes of pinned bitmaps. */
  pinnedBytes(): number;
  /** Evict unpinned bitmaps, least recently used first, until the budget holds. */
  trim(): void;
  /** Whether bitmaps and reservations together exceed the budget. */
  overBudget(): boolean;
  /** Bytes held by cached bitmaps. */
  bytes(): number;
  size(): number;
  /**
   * Count bytes held elsewhere (decoded sources) against the budget. They are never
   * evicted here; `onEvict` tells the owner when a bitmap leaves so it can release them.
   */
  reserve(key: string, bytes: number): void;
  unreserve(key: string): void;
  reservedBytes(): number;
  clear(): void;
}

export interface BitmapCacheOptions {
  readonly budgetBytes?: number;
  /** Called after a bitmap is evicted to stay within budget (not on `delete`/`clear`). */
  readonly onEvict?: (key: string) => void;
}

const bytesOf = (b: CachedBitmap): number => b.width * b.height * 4;

export function createBitmapCache<B extends CachedBitmap>(
  options: BitmapCacheOptions = {},
): BitmapCache<B> {
  const budgetBytes = options.budgetBytes ?? DEFAULT_BUDGET_BYTES;
  const reserved = new Map<string, number>();
  let reservedTotal = 0;
  // Map iteration order is insertion order: the first key is the least recently used.
  const entries = new Map<string, B>();
  // Pins of the frame being painted and of the last painted frame.
  let pinned = new Set<string>();
  let previous = new Set<string>();
  const isPinned = (k: string): boolean => pinned.has(k) || previous.has(k);
  let total = 0;

  const drop = (key: string): void => {
    const b = entries.get(key);
    if (!b) return;
    entries.delete(key);
    pinned.delete(key);
    previous.delete(key);
    total -= bytesOf(b);
    b.close();
  };
  const over = (): boolean => total + reservedTotal > budgetBytes;
  /** Evict unpinned entries other than `keep`, least recently used first. */
  const evict = (keep?: string): void => {
    for (const k of [...entries.keys()]) {
      if (!over()) break;
      if (k === keep || isPinned(k)) continue;
      drop(k);
      options.onEvict?.(k);
    }
  };

  return {
    get(key) {
      const b = entries.get(key);
      if (!b) return undefined;
      entries.delete(key);
      entries.set(key, b);
      return b;
    },
    has: (key) => entries.has(key),
    delete: drop,
    set(key, bitmap) {
      drop(key);
      entries.set(key, bitmap);
      total += bytesOf(bitmap);
      // The newest entry stays even if it alone exceeds the budget, so it can be drawn.
      evict(key);
    },
    pin(key) {
      if (entries.has(key)) pinned.add(key);
    },
    endFrame() {
      previous = pinned;
      pinned = new Set();
    },
    pinnedBytes() {
      let sum = 0;
      for (const [k, b] of entries) if (isPinned(k)) sum += bytesOf(b);
      return sum;
    },
    trim: () => evict(),
    overBudget: over,
    bytes: () => total,
    size: () => entries.size,
    reserve(key, bytes) {
      reservedTotal += bytes - (reserved.get(key) ?? 0);
      reserved.set(key, bytes);
    },
    unreserve(key) {
      reservedTotal -= reserved.get(key) ?? 0;
      reserved.delete(key);
    },
    reservedBytes: () => reservedTotal,
    clear() {
      for (const k of [...entries.keys()]) drop(k);
      pinned.clear();
      previous.clear();
    },
  };
}
