/**
 * Pluggable ID generation (MOD-03a).
 *
 * Generators are pure: `next` returns the ID and the advanced cursor without hidden state,
 * so planning can allocate IDs without committing them. The cursor is opaque,
 * JSON-compatible, and only ever moves forward (undo never rewinds it), which keeps a
 * deleted ID from being reused.
 */
import type { IdKind } from "./ids.js";

/** Opaque generator state, owned by the generator and persisted verbatim. */
export type IdCursor = Readonly<Record<string, number | string>>;

export interface IdGenerator {
  next(
    kind: IdKind,
    cursor: IdCursor,
  ): { readonly id: string; readonly cursor: IdCursor };
  /**
   * Return a cursor advanced past an externally supplied ID. Must be pure and must never
   * move the cursor backwards. Host generators may omit it; callers then use the cursor
   * as-is.
   */
  observe?(id: string, cursor: IdCursor): IdCursor;
}

const PREFIX_BY_KIND: Readonly<Record<IdKind, string>> = {
  node: "n",
  port: "p",
  connection: "c",
  group: "g",
  member: "m",
  value: "v",
};

const KNOWN_PREFIXES: ReadonlySet<string> = new Set(
  Object.values(PREFIX_BY_KIND),
);

/** The empty cursor of the counter generator. */
export const EMPTY_CURSOR: IdCursor = {};

function counterOf(cursor: IdCursor, prefix: string): number {
  const value = cursor[prefix];
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : 0;
}

/** Default generator: one counter per kind, minting `n1`, `p1`, `c1`, ... */
export function createCounterIdGenerator(): IdGenerator {
  return {
    next(kind, cursor) {
      const prefix = PREFIX_BY_KIND[kind];
      const counter = counterOf(cursor, prefix) + 1;
      return {
        id: `${prefix}${counter}`,
        cursor: { ...cursor, [prefix]: counter },
      };
    },
    observe(id, cursor) {
      const match = /^([a-z]+)(\d+)$/u.exec(id);
      const prefix = match?.[1];
      const digits = match?.[2];
      if (
        prefix === undefined ||
        digits === undefined ||
        !KNOWN_PREFIXES.has(prefix)
      ) {
        return cursor;
      }
      const seen = Number(digits);
      if (!Number.isSafeInteger(seen) || seen <= counterOf(cursor, prefix))
        return cursor;
      return { ...cursor, [prefix]: seen };
    },
  };
}
