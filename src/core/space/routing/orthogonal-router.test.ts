import { describe, expect, it } from "vitest";
import { createOrthogonalRouter } from "./orthogonal-router.js";
import type { RouteEnd } from "./route-types.js";
import {
  box,
  DOWN,
  end,
  isAxisAligned,
  LEFT,
  RIGHT,
  UP,
  verticesOf,
  w,
} from "./test-kit.js";

const router = createOrthogonalRouter();
const route = (from: RouteEnd, to: RouteEnd) => router.route({ from, to });
const COMPLETE = { status: "complete", clearOf: "endpoint-nodes" };

describe("orthogonal route shape", () => {
  it("Aligned facing ports: one horizontal segment, no bend", () => {
    const r = route(
      end(w(100, 30), RIGHT, box(0, 0, 100, 60)),
      end(w(300, 30), LEFT, box(300, 0, 100, 60)),
    );
    expect(r.path).toEqual({
      kind: "polyline",
      p0: w(100, 30),
      via: [],
      p1: w(300, 30),
    });
    expect(r.outcome).toEqual(COMPLETE);
  });

  it("Offset facing ports: two bends, middle segment at x = 100", () => {
    const r = route(
      end(w(0, 0), RIGHT, box(-100, -30, 100, 60)),
      end(w(200, 80), LEFT, box(200, 50, 100, 60)),
    );
    expect(verticesOf(r.path)).toEqual([
      w(0, 0),
      w(100, 0),
      w(100, 80),
      w(200, 80),
    ]);
  });

  it("Ports facing the same way: a U beyond the farther port's clearance", () => {
    const r = route(
      end(w(0, 0), RIGHT, box(-100, -30, 100, 60)),
      end(w(100, 200), RIGHT, box(0, 170, 100, 60)),
    );
    expect(verticesOf(r.path)).toEqual([
      w(0, 0),
      w(120, 0),
      w(120, 200),
      w(100, 200),
    ]);
    expect(r.outcome).toEqual(COMPLETE);
  });

  it("Perpendicular ports: one bend", () => {
    const r = route(
      end(w(0, 0), RIGHT, box(-100, -30, 100, 60)),
      end(w(100, 100), UP, box(60, 100, 80, 50)),
    );
    expect(verticesOf(r.path)).toEqual([w(0, 0), w(100, 0), w(100, 100)]);
  });

  it("a perpendicular pair too close for an L takes three bends", () => {
    const r = route(
      end(w(0, 0), RIGHT, box(-100, -30, 100, 60)),
      end(w(10, 100), UP, box(-30, 100, 80, 50)),
    );
    // Any jog height between the two escape points has the same length; the
    // tie-break takes the highest candidate, the escape midpoint.
    expect(verticesOf(r.path)).toEqual([
      w(0, 0),
      w(20, 0),
      w(20, 40),
      w(10, 40),
      w(10, 100),
    ]);
    expect(r.outcome).toEqual(COMPLETE);
  });

  it("Escape direction: the first segment leaves upward for at least the clearance", () => {
    const r = route(
      end(w(0, 0), UP, box(-50, 0, 100, 60)),
      end(w(200, -100), LEFT, box(200, -130, 100, 60)),
    );
    const v = verticesOf(r.path);
    expect(v).toEqual([w(0, 0), w(0, -100), w(200, -100)]);
    expect(v[1]?.x).toBe(0);
    expect((v[0]?.y ?? 0) - (v[1]?.y ?? 0)).toBeGreaterThanOrEqual(20);
  });

  it("Clearance per route registration: 40 against the default 20", () => {
    const ends = [
      end(w(0, 0), RIGHT, box(-100, -30, 100, 60)),
      end(w(0, 200), RIGHT, box(-100, 170, 100, 60)),
    ] as const;
    const wide = createOrthogonalRouter({ clearance: 40 }).route({
      from: ends[0],
      to: ends[1],
    });
    expect(verticesOf(wide.path)).toEqual([
      w(0, 0),
      w(40, 0),
      w(40, 200),
      w(0, 200),
    ]);
    expect(verticesOf(route(ends[0], ends[1]).path)).toEqual([
      w(0, 0),
      w(20, 0),
      w(20, 200),
      w(0, 200),
    ]);
  });

  it("Close facing ports: the middle segment lies 8 units from each port", () => {
    const r = route(
      end(w(0, 0), RIGHT, box(-100, -30, 100, 60)),
      end(w(16, 30), LEFT, box(16, 0, 100, 60)),
    );
    expect(verticesOf(r.path)).toEqual([w(0, 0), w(8, 0), w(8, 30), w(16, 30)]);
    expect(r.outcome).toEqual(COMPLETE);
  });

  it("Sharp by default: every corner is a sharp vertex", () => {
    const r = route(end(w(0, 0), RIGHT), end(w(200, 80), LEFT));
    if (r.path.kind !== "polyline") throw new Error("kind");
    expect(r.path.radii).toBeUndefined();
    const round = createOrthogonalRouter({ cornerRadius: 6 }).route({
      from: end(w(0, 0), RIGHT),
      to: end(w(200, 80), LEFT),
    });
    if (round.path.kind !== "polyline") throw new Error("kind");
    expect(round.path.radii).toEqual([6, 6]);
  });

  it("Rotated node: a port facing down leaves downward", () => {
    const r = route(
      end(w(0, 30), DOWN, box(-50, -30, 100, 60)),
      end(w(200, 300), LEFT, box(200, 270, 100, 60)),
    );
    const v = verticesOf(r.path);
    expect(v[1]?.x).toBe(0);
    expect(v[1]?.y).toBeGreaterThan(30);
  });

  it("every output segment is horizontal or vertical", () => {
    const ends: RouteEnd[] = [
      end(w(0, 0), RIGHT, box(-100, -30, 100, 60)),
      end(w(10, 100), UP, box(-30, 100, 80, 50)),
      end(w(-300, 40), LEFT, box(-300, 10, 100, 60)),
      end(w(0, 30), DOWN, box(-50, -30, 100, 60)),
      end(w(250, -90), w(0.3, -0.8)),
    ];
    for (const a of ends)
      for (const b of ends) {
        if (a === b) continue;
        expect(isAxisAligned(route(a, b).path)).toBe(true);
      }
  });
});
