import { describe, expect, it } from "vitest";
import type { Point, Rect } from "../geometry/spaces.js";
import { between, seededRandom } from "../geometry/test-utils.js";
import { createOrthogonalRouter } from "./orthogonal-router.js";
import type { RouteEnd, RouteResult } from "./route-types.js";
import { end, isAxisAligned, verticesOf, w } from "./test-kit.js";

type W = "world";

/** 1000 seeded end pairs covering axis, diagonal, zero and NaN normals, free ends,
 * overlapping bodies and coincident anchors. */
function pairs(): [RouteEnd, RouteEnd][] {
  const rnd = seededRandom(2026);
  const pick = <T>(xs: readonly T[]): T =>
    xs[Math.floor(rnd() * xs.length)] as T;
  const normals: Point<W>[] = [
    w(1, 0),
    w(-1, 0),
    w(0, 1),
    w(0, -1),
    w(0.8, 0.6),
    w(-0.3, 0.95),
    w(1, 1),
    w(0, 0),
    w(Number.NaN, 0),
  ];
  const randomEnd = (near?: Point<W>): RouteEnd => {
    const base = near ?? w(0, 0);
    const position =
      near && rnd() < 0.3
        ? near
        : w(
            Math.round(base.x + between(rnd, -400, 400)),
            Math.round(base.y + between(rnd, -400, 400)),
          );
    const roll = rnd();
    let body: Rect<W> | undefined;
    if (roll < 0.15) body = undefined;
    else {
      const bw = Math.round(between(rnd, 0, 160));
      const bh = Math.round(between(rnd, 0, 120));
      // The anchor sits on a side of its body, or inside it.
      const side = pick(["right", "left", "top", "bottom", "inside"] as const);
      const x =
        side === "right"
          ? position.x - bw
          : side === "left"
            ? position.x
            : position.x - bw / 2;
      const y =
        side === "bottom"
          ? position.y - bh
          : side === "top"
            ? position.y
            : position.y - bh / 2;
      body = { x, y, w: bw, h: bh };
    }
    return end(position, pick(normals), body);
  };
  const out: [RouteEnd, RouteEnd][] = [];
  for (let i = 0; i < 1000; i++) {
    const a = randomEnd();
    out.push([a, randomEnd(rnd() < 0.5 ? a.position : undefined)]);
  }
  return out;
}

const ROUTERS = [
  createOrthogonalRouter(),
  createOrthogonalRouter({ clearance: 35, cornerRadius: 10 }),
];

function finite(r: RouteResult): boolean {
  return verticesOf(r.path).every(
    (p) => Number.isFinite(p.x) && Number.isFinite(p.y),
  );
}

describe("orthogonal determinism", () => {
  it("equal inputs give identical results on a second run", () => {
    for (const router of ROUTERS) {
      const first = pairs().map(([from, to]) => router.route({ from, to }));
      const second = pairs().map(([from, to]) => router.route({ from, to }));
      expect(second).toEqual(first);
    }
  });

  it("Swapped ends: the same vertices in reverse order and the same outcome", () => {
    for (const router of ROUTERS) {
      for (const [from, to] of pairs()) {
        const ab = router.route({ from, to });
        const ba = router.route({ from: to, to: from });
        expect(verticesOf(ba.path)).toEqual(verticesOf(ab.path).reverse());
        expect(ba.outcome).toEqual(ab.outcome);
        if (ab.path.kind === "polyline" && ba.path.kind === "polyline")
          expect(ba.path.radii).toEqual(
            ab.path.radii && [...ab.path.radii].reverse(),
          );
      }
    }
  });

  it("output is finite and orthogonal for degenerate inputs", () => {
    for (const router of ROUTERS) {
      for (const [from, to] of pairs()) {
        const r = router.route({ from, to });
        expect(finite(r)).toBe(true);
        expect(isAxisAligned(r.path)).toBe(true);
        expect(r.path.p0).toEqual(from.position);
        expect(r.path.p1).toEqual(to.position);
      }
    }
  });

  it("Coincident anchors route with finite values", () => {
    const here = w(5, 5);
    const r = ROUTERS[0]?.route({
      from: end(here, w(0, 0), { x: 0, y: 0, w: 10, h: 10 }),
      to: end(here, w(Number.NaN, 1), undefined),
    });
    expect(r?.path).toEqual({ kind: "polyline", p0: here, via: [], p1: here });
    expect(r?.outcome.status).toBe("complete");
  });
});
