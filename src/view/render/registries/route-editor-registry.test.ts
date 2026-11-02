import { describe, expect, it } from "vitest";
import {
  createRouteEditorRegistry,
  type RouteEditor,
} from "./route-editor-registry.js";

const stub = (): RouteEditor => ({
  handles: () => [],
  hit: () => undefined,
  drag: () => [],
  activate: () => undefined,
  cursor: () => "move",
});

describe("ROU-03b, REN-01 route editor registry", () => {
  it("returns undefined for a kind without an editor", () => {
    expect(createRouteEditorRegistry().get("orthogonal")).toBeUndefined();
  });

  it("registers an editor per kind and rejects a duplicate", () => {
    const reg = createRouteEditorRegistry();
    const a = stub();
    expect(reg.register("orthogonal", a).ok).toBe(true);
    expect(reg.get("orthogonal")).toBe(a);
    const dup = reg.register("orthogonal", stub());
    expect(dup.ok).toBe(false);
    expect(reg.get("orthogonal")).toBe(a);
  });

  it("replace overwrites and notifies the affected kind only", () => {
    const reg = createRouteEditorRegistry();
    const seen: string[] = [];
    const off = reg.onChange((k) => seen.push(k));
    reg.register("a", stub());
    const b = stub();
    reg.replace("a", b);
    expect(reg.get("a")).toBe(b);
    expect(seen).toEqual(["a", "a"]);
    off();
    reg.replace("c", stub());
    expect(seen).toEqual(["a", "a"]);
  });
});
