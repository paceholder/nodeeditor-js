/** Deep freezing for committed records and snapshot arrays (MOD-13). */

/** Recursively freeze plain objects and arrays. Already-frozen values are skipped. */
export function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value))
    return value;
  for (const key of Object.keys(value)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return Object.freeze(value);
}

/** Freeze an array shell only; its elements are records frozen when committed. */
export function freezeShell<T>(
  items: readonly T[],
  enabled: boolean,
): readonly T[] {
  return enabled ? Object.freeze(items) : items;
}
