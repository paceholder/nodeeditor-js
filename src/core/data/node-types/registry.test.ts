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
