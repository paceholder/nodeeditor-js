/**
 * Pluggable ID generation.
 *
 * Generators are pure: `next` returns the ID and the advanced cursor without hidden state,
 * so planning can allocate IDs without committing them. The cursor is opaque,
 * JSON-compatible, and only ever moves forward (undo never rewinds it), which keeps a
 * deleted ID from being reused.
 */
import { MisuseError } from "../result.js";
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
  /**
   * Merge a committed patch's cursor into the model's cursor. Must be pure and must never
   * move the cursor backwards. Without it, a number replaces a smaller number and any
   * other incoming value replaces the current one.
   */
  merge?(current: IdCursor, incoming: IdCursor): IdCursor;
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

/**
 * Why `value` cannot be an ID cursor, or undefined when it can: a plain object whose own
 * keys are not `__proto__` and whose values are text or safe integers. Never throws.
 */
export function cursorProblem(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return "an ID cursor must be an object";
  for (const [key, v] of Object.entries(value)) {
    if (key === "__proto__") return "an ID cursor key may not be __proto__";
    if (typeof v !== "string" && !Number.isSafeInteger(v))
      return `ID cursor value ${key} must be text or a safe integer`;
  }
  return undefined;
}

/** The empty cursor of the counter generator. */
export const EMPTY_CURSOR: IdCursor = {};

/**
 * Largest counter `observe` tracks. Counting from 1 never reaches it, so an outside ID
 * above it cannot collide with a minted one, and tracking it would only exhaust the counter.
 */
export const MAX_OBSERVED_COUNTER = 2 ** 50;

/** The counter for `prefix`; a corrupt value fails loudly instead of restarting at 0. */
function counterOf(cursor: IdCursor, prefix: string): number {
  const value = cursor[prefix];
  if (value === undefined) return 0;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new MisuseError(
      `ID cursor counter ${prefix} must be a non-negative safe integer, not ${String(value)}`,
    );
  }
  return value;
}

/** Default generator: one counter per kind, minting `n1`, `p1`, `c1`, ... */
export function createCounterIdGenerator(): IdGenerator {
  return {
    next(kind, cursor) {
      const prefix = PREFIX_BY_KIND[kind];
      const current = counterOf(cursor, prefix);
      if (current >= Number.MAX_SAFE_INTEGER)
        throw new MisuseError(`ID counter ${prefix} is exhausted`);
      const counter = current + 1;
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
      if (
        !Number.isSafeInteger(seen) ||
        seen > MAX_OBSERVED_COUNTER ||
        seen <= counterOf(cursor, prefix)
      )
        return cursor;
      return { ...cursor, [prefix]: seen };
    },
  };
}
