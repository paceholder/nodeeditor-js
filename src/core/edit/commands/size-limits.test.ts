import { describe, expect, it } from "vitest";
import { mkNode } from "../../data/model/test-helpers.js";
import { createNodeTypeRegistry } from "../../data/node-types/registry.js";
import { createGraphModel } from "../../graph-model.js";
import { resolveSizeLimits, withinLimits } from "./size-limits.js";

const INF = Number.POSITIVE_INFINITY;

function registryWith(sizeLimits?: {
  min?: { width: number; height: number };
  max?: { width: number; height: number };
}) {
  const registry = createNodeTypeRegistry();
  registry.register({
    type: "t",
    label: "T",
    defaultSize: { width: 40, height: 20 },
    ...(sizeLimits ? { sizeLimits } : {}),
  });
  return registry;
}

describe("NOD-04a size-limit resolution", () => {
  it("defaults to a 1 x 1 minimum and no maximum", () => {
    expect(resolveSizeLimits(mkNode("n1"), registryWith())).toEqual({
      min: { width: 1, height: 1 },
      max: { width: INF, height: INF },
    });
    // Unknown types get the library default too.
    expect(
      resolveSizeLimits(mkNode("n1", { type: "zzz" }), registryWith()).min,
    ).toEqual({ width: 1, height: 1 });
  });

  it("a type bound replaces only its own field", () => {
    const onlyMax = registryWith({ max: { width: 200, height: 100 } });
    expect(resolveSizeLimits(mkNode("n1"), onlyMax)).toEqual({
      min: { width: 1, height: 1 },
      max: { width: 200, height: 100 },
    });
    const onlyMin = registryWith({ min: { width: 20, height: 10 } });
    expect(resolveSizeLimits(mkNode("n1"), onlyMin)).toEqual({
      min: { width: 20, height: 10 },
      max: { width: INF, height: INF },
    });
  });

  it("the host hook sees the record and the type's limits", () => {
    const registry = registryWith({ min: { width: 20, height: 10 } });
    const seen: unknown[] = [];
    const limits = resolveSizeLimits(
      mkNode("n1"),
      registry,
      (node, fromType) => {
        seen.push(node.id, fromType.min);
        return { max: { width: 50, height: 50 } };
      },
    );
    expect(seen).toEqual(["n1", { width: 20, height: 10 }]);
    expect(limits).toEqual({
      min: { width: 20, height: 10 },
      max: { width: 50, height: 50 },
    });
  });

  it("widens max to min for an inconsistent hook result", () => {
    const limits = resolveSizeLimits(mkNode("n1"), registryWith(), () => ({
      min: { width: 30, height: 30 },
      max: { width: 10, height: 40 },
    }));
    expect(limits.max).toEqual({ width: 30, height: 40 });
  });

  it("Instance limits refine type limits", () => {
    const registry = registryWith({ min: { width: 20, height: 1 } });
    const model = createGraphModel({
      registry,
      sizeLimits: (node) =>
        node.title === "big" ? { min: { width: 40, height: 1 } } : undefined,
    });
    model.createNode("t", { x: 0, y: 0 }, { title: "big" });
    model.createNode("t", { x: 0, y: 0 });
    const [big, plain] = model.reader.nodes();
    if (!big || !plain) throw new Error("nodes missing");
    const width30 = { width: 30, height: 20 };
    const bigLimits = model.sizeLimits(big.id);
    const plainLimits = model.sizeLimits(plain.id);
    if (!bigLimits || !plainLimits) throw new Error("limits missing");
    expect(withinLimits(width30, bigLimits)).toBe(false);
    expect(withinLimits(width30, plainLimits)).toBe(true);
    expect(model.sizeLimits("n404" as never)).toBeUndefined();
  });
});
