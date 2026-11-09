/**
 * Ordered collection of immutable records keyed by ID.
 *
 * Every entry carries a monotonically increasing `seq` that fixes collection order.
 * Order never comes from Map iteration: the ordered list is sorted by `seq`
 * and cached until the collection changes. Internal to the store.
 */
import { freezeShell } from "./freeze.js";

export interface Entry<T> {
  readonly record: T;
  readonly seq: number;
}

export interface Collection<T> {
  has(id: string): boolean;
  get(id: string): T | undefined;
  seqOf(id: string): number | undefined;
  /** The ID whose entry has sequence `seq`, if any. */
  idAt(seq: number): string | undefined;
  /** Records in `seq` order. The returned array is never mutated afterwards. */
  list(): readonly T[];
  readonly size: number;
}

export interface MutableCollection<T> extends Collection<T> {
  set(id: string, record: T, seq: number): void;
  delete(id: string): Entry<T> | undefined;
}

export function createCollection<T>(
  freezeArrays: boolean,
): MutableCollection<T> {
  const entries = new Map<string, Entry<T>>();
  const bySeq = new Map<number, string>();
  let cached: readonly T[] | undefined;
  return {
    has: (id) => entries.has(id),
    get: (id) => entries.get(id)?.record,
    seqOf: (id) => entries.get(id)?.seq,
    idAt: (seq) => bySeq.get(seq),
    get size() {
      return entries.size;
    },
    list() {
      if (!cached) {
        const sorted = [...entries.values()].sort((a, b) => a.seq - b.seq);
        cached = freezeShell(
          sorted.map((e) => e.record),
          freezeArrays,
        );
      }
      return cached;
    },
    set(id, record, seq) {
      const before = entries.get(id)?.seq;
      if (before !== undefined && bySeq.get(before) === id)
        bySeq.delete(before);
      entries.set(id, { record, seq });
      bySeq.set(seq, id);
      cached = undefined;
    },
    delete(id) {
      const existing = entries.get(id);
      if (existing) {
        entries.delete(id);
        if (bySeq.get(existing.seq) === id) bySeq.delete(existing.seq);
        cached = undefined;
      }
      return existing;
    },
  };
}
