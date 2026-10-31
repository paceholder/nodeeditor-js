import { describe, expect, it } from "vitest";
import { createNodeTypeRegistry } from "./registry.js";

const size = { width: 10, height: 10 };

describe("NOD-01 node type registry", () => {
  it("registers two types independently, in registration order", () => {
    const registry = createNodeTypeRegistry();
    expect(
      registry.register({ type: "a", label: "A", defaultSize: size }).ok,
    ).toBe(true);
    expect(
      registry.register({
        type: "b",
        label: "B",
        defaultSize: size,
        creatable: false,
      }).ok,
    ).toBe(true);
    expect(
      registry.register({ type: "c", label: "C", defaultSize: size }).ok,
    ).toBe(true);
    expect(registry.get("a")?.label).toBe("A");
    expect(registry.has("b")).toBe(true);
    expect(registry.has("zzz")).toBe(false);
    expect(registry.creatable().map((d) => d.type)).toEqual(["a", "c"]);
  });

  it("rejects a duplicate key with a Result and keeps the first", () => {
    const registry = createNodeTypeRegistry();
    registry.register({ type: "a", label: "first", defaultSize: size });
    const again = registry.register({
      type: "a",
      label: "second",
      defaultSize: size,
    });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe("duplicate-type");
    expect(registry.get("a")?.label).toBe("first");
  });
});

describe("NOD-01, NOD-04a size limits on a node type", () => {
  const register = (sizeLimits: unknown) =>
    createNodeTypeRegistry().register({
      type: "t",
      label: "T",
      defaultSize: size,
      sizeLimits: sizeLimits as never,
    });
  const code = (result: ReturnType<typeof register>) =>
    result.ok ? "ok" : result.error.code;

  it.each([
    ["a negative min", { min: { width: -1, height: 5 } }],
    ["a non-finite min", { min: { width: Number.NaN, height: 5 } }],
    ["an infinite min", { min: { width: 5, height: Infinity } }],
    ["a negative max", { max: { width: 5, height: -2 } }],
    ["a NaN max", { max: { width: Number.NaN, height: 5 } }],
    [
      "min above max",
      { min: { width: 30, height: 5 }, max: { width: 20, height: 50 } },
    ],
    ["max below the default min", { max: { width: 0.5, height: 5 } }],
  ])("rejects %s with malformed-record", (_, limits) => {
    const result = register(limits);
    expect(code(result)).toBe("malformed-record");
    if (!result.ok) expect(result.error.entities).toEqual(["t"]);
  });

  it("accepts a type with only min, an infinite max, and min equal to max", () => {
    expect(code(register({ min: { width: 20, height: 0 } }))).toBe("ok");
    expect(code(register({ max: { width: Infinity, height: 40 } }))).toBe("ok");
    expect(
      code(
        register({
          min: { width: 9, height: 9 },
          max: { width: 9, height: 9 },
        }),
      ),
    ).toBe("ok");
  });
});
