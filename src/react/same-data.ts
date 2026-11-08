/**
 * Equality by value for the plain data a prop can hold: objects, arrays and
 * primitives are compared entry by entry; anything else (a function, a class instance) by
 * identity. Lets an inline `theme={{ ... }}` cost nothing while its contents are unchanged.
 */
export function sameData(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const proto = Object.getPrototypeOf(a);
  if (proto !== Object.getPrototypeOf(b)) return false;
  if (proto !== Object.prototype && proto !== Array.prototype) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every(
    (k) =>
      Object.hasOwn(b, k) &&
      sameData(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k],
      ),
  );
}
