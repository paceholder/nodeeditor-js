/**
 * JSON values (SER-02): the check that keeps non-JSON data out of snapshots, deep
 * equality, and a prototype-safe deep copy.
 */

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export interface JsonProblem {
  /** Path inside the checked value, e.g. `payload.items[2]`. */
  readonly path: string;
  readonly reason: string;
  /** `depth` problems map to `limit-exceeded`, the rest to `non-json-payload`. */
  readonly kind: "non-json" | "depth";
}

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

/**
 * Find the first reason `value` is not plain JSON data: undefined, functions, symbols,
 * bigints, non-finite numbers, Dates, Maps, class instances, sparse arrays, cycles, or
 * nesting deeper than `maxDepth`. Returns undefined for valid data. Never throws.
 */
export function checkJson(
  value: unknown,
  path: string,
  maxDepth = 64,
): JsonProblem | undefined {
  const ancestors = new Set<object>();
  const walk = (
    v: unknown,
    at: string,
    depth: number,
  ): JsonProblem | undefined => {
    const bad = (reason: string): JsonProblem => ({
      path: at,
      reason,
      kind: "non-json",
    });
    if (v === null || typeof v === "string" || typeof v === "boolean")
      return undefined;
    if (typeof v === "number")
      return Number.isFinite(v) ? undefined : bad("number is not finite");
    if (typeof v !== "object") return bad(`${typeof v} is not JSON data`);
    if (depth > maxDepth) {
      return {
        path: at,
        reason: `nesting deeper than ${maxDepth}`,
        kind: "depth",
      };
    }
    if (ancestors.has(v)) return bad("circular reference");
    ancestors.add(v);
    try {
      if (Array.isArray(v)) {
        for (let i = 0; i < v.length; i += 1) {
          if (!(i in v)) return bad("sparse array");
          const found = walk(v[i], `${at}[${i}]`, depth + 1);
          if (found) return found;
        }
        return undefined;
      }
      if (!isPlainObject(v)) return bad("not a plain object");
      for (const key of Object.keys(v)) {
        const found = walk(
          (v as Record<string, unknown>)[key],
          `${at}.${key}`,
          depth + 1,
        );
        if (found) return found;
      }
      return undefined;
    } finally {
      ancestors.delete(v);
    }
  };
  return walk(value, path, 0);
}

/** Deep equality of JSON values; key order is irrelevant. */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => jsonEqual(x, b[i]));
  }
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every(
    (k) =>
      Object.hasOwn(b, k) &&
      jsonEqual(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k],
      ),
  );
}

/** Deep copy of checked JSON data, preserving key order and `__proto__` as a plain key. */
export function cloneJson<T>(value: T): T {
  if (typeof value !== "object" || value === null) return value;
  if (Array.isArray(value)) return value.map((x) => cloneJson(x)) as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    Object.defineProperty(out, k, {
      value: cloneJson(v),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return out as T;
}
