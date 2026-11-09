import { describe, expect, it } from "vitest";
import type { RouteConstraint } from "../../data/model/records.js";
import { createOrthogonalRouter } from "./orthogonal-router.js";
import { box, end, LEFT, RIGHT, w } from "./test-kit.js";

const A = end(w(0, 0), RIGHT, box(-100, -30, 100, 60));
const B = end(w(90000, 80), LEFT, box(90000, 50, 100, 60));

/** Vertical pins only: each next horizontal coordinate lies past the last pin. */
const vertical = (count: number): RouteConstraint[] =>
  Array.from({ length: count }, (_, i) => ({
    kind: "segment",
    orientation: "vertical",
    at: 100 + i * 3,
  }));

/** Best of three runs, so a busy machine does not decide the result. */
const time = (run: () => void): number => {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < 3; i++) {
    const started = performance.now();
    run();
    best = Math.min(best, performance.now() - started);
  }
  return best;
};

describe("pinned orthogonal routing is linear", () => {
  it("ten times the pins of one orientation take about ten times as long", () => {
    const router = createOrthogonalRouter();
    const cost = (count: number) => {
      const pins = vertical(count);
      return time(() => router.route({ from: A, to: B, constraints: pins }));
    };
    cost(2000); // warm up
    const small = cost(2000);
    const large = cost(20_000);
    // Quadratic growth would be a hundredfold.
    expect(large / Math.max(small, 0.05)).toBeLessThan(35);
  });

  it("the largest allowed pin count routes through the router with every pin realized", () => {
    const pins = vertical(256);
    const route = createOrthogonalRouter().route({
      from: A,
      to: B,
      constraints: pins,
    });
    expect(route.realized?.every((i) => i >= 0)).toBe(true);
  });
});
