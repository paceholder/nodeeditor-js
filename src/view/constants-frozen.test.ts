import { describe, expect, it } from "vitest";
import * as advanced from "./advanced.js";
import * as view from "./index.js";

function isPlain(value: unknown): value is object {
  if (typeof value !== "object" || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return Array.isArray(value) || proto === Object.prototype || proto === null;
}

/** Paths of plain objects and arrays inside `value` that are not frozen. */
function unfrozen(value: unknown, path: string, seen = new Set()): string[] {
  if (!isPlain(value) || seen.has(value)) return [];
  seen.add(value);
  const own = Object.isFrozen(value) ? [] : [path];
  return [
    ...own,
    ...Object.entries(value).flatMap(([k, v]) =>
      unfrozen(v, `${path}.${k}`, seen),
    ),
  ];
}

describe("immutable exported constants", () => {
  it("every constant object or array exported by the view entries is deeply frozen", () => {
    const exported = { ...view, ...advanced } as Record<string, unknown>;
    const constants = Object.entries(exported).filter(([, v]) => isPlain(v));
    expect(constants.length).toBeGreaterThan(5);
    const found = constants.flatMap(([name, v]) => unfrozen(v, name));
    expect(found).toEqual([]);
  });

  it("assigning to the default theme fails and leaves it unchanged", () => {
    const theme = view.DEFAULT_THEME as { background: string };
    const before = theme.background;
    expect(() => {
      theme.background = "#ffffff";
    }).toThrow(TypeError);
    expect(view.DEFAULT_THEME.background).toBe(before);
  });
});
