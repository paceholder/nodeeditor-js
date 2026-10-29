import { describe, expect, it } from "vitest";
import { resolveStyle } from "./resolve-style.js";
import { DEFAULT_THEME, mergeTheme } from "./tokens.js";

describe("resolveStyle", () => {
  const theme = mergeTheme(DEFAULT_THEME, {
    typeOverrides: { pump: { nodeFill: "#111111", nodeStroke: "#222222" } },
    entityOverrides: { n7: { nodeFill: "#333333" } },
  });

  it("VIS-01 per-type and per-entity overrides: entity beats type beats theme", () => {
    expect(resolveStyle(theme, { type: "valve", id: "n1" }).nodeFill).toBe(
      DEFAULT_THEME.nodeFill,
    );
    const typed = resolveStyle(theme, { type: "pump", id: "n1" });
    expect(typed.nodeFill).toBe("#111111");
    expect(typed.nodeStroke).toBe("#222222");
    const entity = resolveStyle(theme, { type: "pump", id: "n7" });
    expect(entity.nodeFill).toBe("#333333");
    expect(entity.nodeStroke).toBe("#222222"); // type override still applies
  });

  it("VIS-01 no override returns the theme itself without allocating", () => {
    expect(resolveStyle(theme, { type: "valve", id: "n1" })).toBe(theme);
  });

  it("VIS-01 prototype names are not overrides", () => {
    expect(resolveStyle(theme, { type: "constructor", id: "toString" })).toBe(
      theme,
    );
  });

  it("VIS-01 merging a patch keeps earlier overrides", () => {
    const next = mergeTheme(theme, {
      typeOverrides: { valve: { nodeFill: "#444444" } },
    });
    expect(resolveStyle(next, { type: "pump", id: "x" }).nodeFill).toBe(
      "#111111",
    );
    expect(resolveStyle(next, { type: "valve", id: "x" }).nodeFill).toBe(
      "#444444",
    );
    expect(theme.typeOverrides).not.toHaveProperty("valve"); // base untouched
  });

  it("VIS-01 an undefined override removes it and leaves the others", () => {
    const next = mergeTheme(theme, {
      typeOverrides: { pump: undefined },
      entityOverrides: { n7: undefined },
    });
    expect(next.typeOverrides).not.toHaveProperty("pump");
    expect(next.entityOverrides).not.toHaveProperty("n7");
    expect(resolveStyle(next, { type: "pump", id: "n7" })).toBe(next);
    expect(theme.typeOverrides).toHaveProperty("pump"); // base untouched
  });
});
