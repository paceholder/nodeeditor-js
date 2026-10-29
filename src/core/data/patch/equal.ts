/** Structural equality for JSON-compatible values (old-value checks). */

export function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (
    typeof a !== "object" ||
    typeof b !== "object" ||
    a === null ||
    b === null
  )
    return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length)
      return false;
    return a.every((item, i) => valuesEqual(item, b[i]));
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left).filter((k) => left[k] !== undefined);
  const other = Object.keys(right).filter((k) => right[k] !== undefined);
  return (
    keys.length === other.length &&
    keys.every((k) => k in right && valuesEqual(left[k], right[k]))
  );
}
