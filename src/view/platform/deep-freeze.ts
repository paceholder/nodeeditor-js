/**
 * Freeze a constant and every plain object and array inside it, so an exported default
 * (theme, tool options, keymap) cannot be changed by one host for every view. Functions
 * and class instances are left as they are.
 */
export function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  const proto = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && proto !== Object.prototype && proto !== null) {
    return value;
  }
  for (const inner of Object.values(value)) deepFreeze(inner);
  return Object.freeze(value);
}
