import { describe, expect, it } from "vitest";
import { mkNode } from "../../data/model/test-helpers.js";
import { createGraphModel } from "../../graph-model.js";
import { resolveCapability } from "./resolve.js";
import type { CapabilityContext } from "./types.js";

const graph = createGraphModel().reader;

function ctx(over: Partial<CapabilityContext> = {}): CapabilityContext {
  return { readOnly: () => false, typeDefaults: () => undefined, ...over };
}

describe("capability resolution order", () => {
  const node = mkNode("n1");

  it("allows when no layer has an opinion", () => {
    expect(resolveCapability("move", node, ctx(), graph).ok).toBe(true);
  });

  it("type default denies, record override re-allows", () => {
    const c = ctx({ typeDefaults: () => ({ move: false }) });
    const denied = resolveCapability("move", node, c, graph);
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.rejection.code).toBe("capability-denied");
    const overridden = mkNode("n1", { capabilities: { move: true } });
    expect(resolveCapability("move", overridden, c, graph).ok).toBe(true);
  });

  it("host policy beats record override and type default", () => {
    const c = ctx({
      policy: { decide: (action) => (action === "move" ? false : undefined) },
      typeDefaults: () => ({ move: true }),
    });
    const n = mkNode("n1", { capabilities: { move: true } });
    expect(resolveCapability("move", n, c, graph).ok).toBe(false);
    expect(resolveCapability("rotate", n, c, graph).ok).toBe(true);
  });

  it("host policy may allow what a type default denies", () => {
    const c = ctx({
      policy: { decide: () => true },
      typeDefaults: () => ({ move: false }),
    });
    expect(resolveCapability("move", node, c, graph).ok).toBe(true);
  });

  it("read-only denies everything and beats the host policy", () => {
    const c = ctx({ readOnly: () => true, policy: { decide: () => true } });
    expect(resolveCapability("edit", node, c, graph).ok).toBe(false);
  });
});
