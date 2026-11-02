import { describe, expect, it } from "vitest";
import { createBezierRouter, createStraightRouter } from "./basic-routers.js";
import { createOrthogonalRouter } from "./orthogonal-router.js";
import { createRouteRegistry } from "./route-registry.js";
import { end, LEFT, RIGHT, w } from "./test-kit.js";

const INPUT = {
  from: end(w(0, 0), RIGHT),
  to: end(w(200, 80), LEFT),
  constraints: [],
};

describe("route registry", () => {
  it("Default route unchanged: an unregistered kind gets the Bezier router", () => {
    const routes = createRouteRegistry();
    expect(routes.has("default")).toBe(false);
    expect(routes.get("default")).toBe(routes.defaultRouter);
    expect(routes.get("anything").route(INPUT).path.kind).toBe("cubic");
  });

  it("a configured default router is used for unregistered kinds", () => {
    const orthogonal = createOrthogonalRouter();
    const routes = createRouteRegistry({ default: orthogonal });
    expect(routes.defaultRouter).toBe(orthogonal);
    expect(routes.get("x").route(INPUT).path.kind).toBe("polyline");
  });

  it("register rejects a duplicate kind; replace overwrites and notifies with the kind", () => {
    const routes = createRouteRegistry();
    const seen: string[] = [];
    const off = routes.onChange((kind) => seen.push(kind));
    const straight = createStraightRouter();
    expect(routes.register("direct", straight).ok).toBe(true);
    const again = routes.register("direct", createBezierRouter());
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe("duplicate-type");
    expect(routes.get("direct")).toBe(straight);
    const orthogonal = createOrthogonalRouter();
    routes.replace("delayed", orthogonal);
    expect(routes.get("delayed")).toBe(orthogonal);
    expect(seen).toEqual(["direct", "delayed"]);
    off();
    routes.replace("delayed", straight);
    expect(seen).toEqual(["direct", "delayed"]);
  });

  it("straight and Bezier routers report complete and clear of nothing", () => {
    for (const router of [createStraightRouter(), createBezierRouter()]) {
      expect(router.route(INPUT).outcome).toEqual({
        status: "complete",
        clearOf: "nothing",
      });
    }
    expect(createStraightRouter().route(INPUT).path).toEqual({
      kind: "line",
      p0: w(0, 0),
      p1: w(200, 80),
    });
  });
});
