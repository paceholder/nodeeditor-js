import { describe, expect, it } from "vitest";
import { seededRandom } from "../geometry/test-utils.js";
import { createBezierRouter, createStraightRouter } from "./basic-routers.js";
import { crossesInterior } from "./orthogonal-check.js";
import { createOrthogonalRouter } from "./orthogonal-router.js";
import type { RouteEnd } from "./route-types.js";
import { box, end, LEFT, RIGHT, verticesOf, w } from "./test-kit.js";

const router = createOrthogonalRouter();
const route = (from: RouteEnd, to: RouteEnd) => router.route({ from, to });
const COMPLETE = { status: "complete", clearOf: "endpoint-nodes" };

/** True when no segment except the exempt end ones crosses either body. */
function clearOfBodies(
  from: RouteEnd,
  to: RouteEnd,
  v: { x: number; y: number }[],
) {
  for (let i = 0; i + 1 < v.length; i++) {
    const a = v[i] as { x: number; y: number };
    const b = v[i + 1] as { x: number; y: number };
    if (from.body && i > 0 && crossesInterior(a, b, from.body)) return false;
    if (to.body && i < v.length - 2 && crossesInterior(a, b, to.body))
      return false;
  }
  return true;
}

describe("ROU-01b orthogonal route clear of its endpoint nodes", () => {
  it("ROU-01b Backwards wire goes around on the shorter side (overlapping ranges)", () => {
    const from = end(w(100, 50), RIGHT, box(0, 0, 100, 60));
    const to = end(w(-300, 90), LEFT, box(-300, 0, 100, 100));
    const r = route(from, to);
    expect(verticesOf(r.path)).toEqual([
      w(100, 50),
      w(120, 50),
      w(120, 120),
      w(-320, 120),
      w(-320, 90),
      w(-300, 90),
    ]);
    expect(clearOfBodies(from, to, verticesOf(r.path))).toBe(true);
    expect(r.outcome).toEqual(COMPLETE);
    // Ports near the top go around above.
    const high = route(
      end(w(100, 10), RIGHT, box(0, 0, 100, 60)),
      end(w(-300, 20), LEFT, box(-300, 0, 100, 100)),
    );
    expect(verticesOf(high.path)[2]).toEqual(w(120, -20));
  });

  it("ROU-01b Backwards wire goes around nested vertical ranges", () => {
    const from = end(w(100, 30), RIGHT, box(0, 0, 100, 60));
    const to = end(w(-300, 100), LEFT, box(-300, -50, 100, 200));
    const r = route(from, to);
    expect(verticesOf(r.path)).toEqual([
      w(100, 30),
      w(120, 30),
      w(120, 170),
      w(-320, 170),
      w(-320, 100),
      w(-300, 100),
    ]);
    expect(clearOfBodies(from, to, verticesOf(r.path))).toBe(true);
  });

  it("ROU-01b Equal detours: the route above is chosen, every time", () => {
    const from = end(w(100, 30), RIGHT, box(0, 0, 100, 60));
    const to = end(w(-300, 30), LEFT, box(-300, 0, 100, 60));
    const expected = [
      w(100, 30),
      w(120, 30),
      w(120, -20),
      w(-320, -20),
      w(-320, 30),
      w(-300, 30),
    ];
    for (let i = 0; i < 100; i++) {
      expect(verticesOf(route(from, to).path)).toEqual(expected);
      expect(verticesOf(route(to, from).path)).toEqual([...expected].reverse());
    }
  });

  it("ROU-01b Backwards wire between separated nodes", () => {
    const from = end(w(100, 30), RIGHT, box(0, 0, 100, 60));
    const to = end(w(-300, 230), LEFT, box(-300, 200, 100, 60));
    const r = route(from, to);
    expect(verticesOf(r.path)).toEqual([
      w(100, 30),
      w(120, 30),
      w(120, 130),
      w(-320, 130),
      w(-320, 230),
      w(-300, 230),
    ]);
    expect(r.outcome).toEqual(COMPLETE);
  });

  it("ROU-01b Connection to the same node goes around it", () => {
    const body = box(0, 0, 100, 60);
    const from = end(w(100, 30), RIGHT, body);
    const to = end(w(0, 30), LEFT, body);
    const r = route(from, to);
    expect(verticesOf(r.path)).toEqual([
      w(100, 30),
      w(120, 30),
      w(120, -20),
      w(-20, -20),
      w(-20, 30),
      w(0, 30),
    ]);
    expect(clearOfBodies(from, to, verticesOf(r.path))).toBe(true);
    expect(r.outcome).toEqual(COMPLETE);
  });

  it("ROU-01b ROU-05 Unrelated node in the way: crossed unchanged, clear of endpoint nodes only", () => {
    const from = end(w(100, 30), RIGHT, box(0, 0, 100, 60));
    const to = end(w(500, 30), LEFT, box(500, 0, 100, 60));
    const r = route(from, to);
    // The router has no input for other nodes, so the route ignores this one.
    const unrelated = box(250, -40, 60, 140);
    const v = verticesOf(r.path);
    expect(v).toEqual([w(100, 30), w(500, 30)]);
    expect(crossesInterior(v[0] ?? w(0, 0), v[1] ?? w(0, 0), unrelated)).toBe(
      true,
    );
    expect(r.outcome).toEqual({
      status: "complete",
      clearOf: "endpoint-nodes",
    });
  });

  it("ROU-06 Overlapping endpoint nodes: fallback path drawn, unroutable and clear of nothing", () => {
    const from = end(w(100, 30), RIGHT, box(0, 0, 100, 60));
    const to = end(w(50, 40), LEFT, box(50, 10, 100, 60));
    const r = route(from, to);
    expect(r.outcome).toEqual({ status: "unroutable", clearOf: "nothing" });
    expect(r.path.p0).toEqual(w(100, 30));
    expect(r.path.p1).toEqual(w(50, 40));
    expect(verticesOf(r.path).every((p) => Number.isFinite(p.x + p.y))).toBe(
      true,
    );
  });

  it("ROU-06 a port anchored inside its body box falls back", () => {
    const r = route(
      end(w(50, 30), RIGHT, box(0, 0, 100, 60)),
      end(w(-300, 30), LEFT, box(-300, 0, 100, 60)),
    );
    expect(r.outcome).toEqual({ status: "unroutable", clearOf: "nothing" });
    expect(r.path.p0).toEqual(w(50, 30));
  });

  it("ROU-05 ROU-06 no built-in router reports a scope beyond endpoint-nodes", () => {
    const rnd = seededRandom(3);
    const routers = [
      createStraightRouter(),
      createBezierRouter(),
      router,
      createOrthogonalRouter({ clearance: 40, cornerRadius: 8 }),
    ];
    const randomEnd = (): RouteEnd => {
      const x = rnd() * 600 - 300;
      const y = rnd() * 600 - 300;
      const n =
        [RIGHT, LEFT, w(0, 1), w(0, -1)][Math.floor(rnd() * 4)] ?? RIGHT;
      return end(w(x, y), n, box(x - 50, y - 30, 100, 60));
    };
    for (let i = 0; i < 200; i++) {
      const from = randomEnd();
      const to = randomEnd();
      for (const r of routers) {
        const { outcome } = r.route({ from, to });
        expect(["nothing", "endpoint-nodes"]).toContain(outcome.clearOf);
        if (outcome.status !== "complete")
          expect(outcome.clearOf).toBe("nothing");
      }
    }
  });
});
