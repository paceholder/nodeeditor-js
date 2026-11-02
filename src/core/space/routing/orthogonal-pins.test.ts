import { describe, expect, it } from "vitest";
import type { RouteConstraint } from "../../data/model/records.js";
import type { Point } from "../geometry/spaces.js";
import { between, seededRandom } from "../geometry/test-utils.js";
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

type W = "world";

const V = (at: number): RouteConstraint => ({
  kind: "segment",
  orientation: "vertical",
  at,
});
const H = (at: number): RouteConstraint => ({
  kind: "segment",
  orientation: "horizontal",
  at,
});

const router = createOrthogonalRouter();
const A = end(w(0, 0), RIGHT, box(-100, -30, 100, 60));
const B = end(w(200, 80), LEFT, box(200, 50, 100, 60));

const pts = (list: readonly [number, number][]): Point<W>[] =>
  list.map(([x, y]) => w(x, y));

/** Route both ways: the pins reverse with the ends (ROU-07). */
function both(
  from: RouteEnd,
  to: RouteEnd,
  constraints: readonly RouteConstraint[],
) {
  const forward = router.route({ from, to, constraints });
  const back = router.route({
    from: to,
    to: from,
    constraints: [...constraints].reverse(),
  });
  return { forward, back };
}

function check(
  from: RouteEnd,
  to: RouteEnd,
  constraints: readonly RouteConstraint[],
  vertices: readonly [number, number][],
  realized: readonly number[],
) {
  const { forward, back } = both(from, to, constraints);
  expect(verticesOf(forward.path)).toEqual(pts(vertices));
  expect(forward.realized).toEqual(realized);
  expect(forward.outcome.status).toBe("complete");
  expect(verticesOf(back.path)).toEqual([...pts(vertices)].reverse());
  expect(isAxisAligned(forward.path)).toBe(true);
  const n = vertices.length - 1;
  expect(back.realized).toEqual([...realized].reverse().map((i) => n - 1 - i));
}

describe("ROU-03c pin routing shapes", () => {
  it("ROU-03c one vertical pin in an S: the middle segment moves to the pin", () => {
    check(
      A,
      B,
      [V(60)],
      [
        [0, 0],
        [60, 0],
        [60, 80],
        [200, 80],
      ],
      [1],
    );
  });

  it("ROU-03c one horizontal pin in a U: the free parts take the automatic shape around it", () => {
    check(
      end(w(0, 0), RIGHT),
      end(w(0, 100), RIGHT),
      [H(-30)],
      [
        [0, 0],
        [20, 0],
        [20, -30],
        [40, -30],
        [40, 100],
        [0, 100],
      ],
      [2],
    );
  });

  it("ROU-03c two vertical pins in a row: a free segment connects them at the midpoint", () => {
    check(
      A,
      B,
      [V(60), V(140)],
      [
        [0, 0],
        [60, 0],
        [60, 40],
        [140, 40],
        [140, 80],
        [200, 80],
      ],
      [1, 3],
    );
  });

  it("ROU-03c a horizontal pin between the ends gets free segments at the midpoints", () => {
    check(
      A,
      B,
      [H(-40)],
      [
        [0, 0],
        [100, 0],
        [100, -40],
        [140, -40],
        [140, 80],
        [200, 80],
      ],
      [2],
    );
  });

  it("ROU-03c a pin at the escape coordinate sits right at the escape point", () => {
    check(
      A,
      B,
      [V(20)],
      [
        [0, 0],
        [20, 0],
        [20, 80],
        [200, 80],
      ],
      [1],
    );
  });

  it("ROU-03c a pin on a stub's own line is realized by the stub", () => {
    check(
      A,
      B,
      [H(0)],
      [
        [0, 0],
        [100, 0],
        [100, 80],
        [200, 80],
      ],
      [0],
    );
    check(
      A,
      B,
      [H(80)],
      [
        [0, 0],
        [100, 0],
        [100, 80],
        [200, 80],
      ],
      [2],
    );
  });

  it("ROU-03c Pin behind the target: extra bends, the last segment enters along the inward escape", () => {
    check(
      A,
      B,
      [V(300)],
      [
        [0, 0],
        [300, 0],
        [300, 40],
        [180, 40],
        [180, 80],
        [200, 80],
      ],
      [1],
    );
  });

  it("ROU-03c Pin behind the source: the route leaves along the stub, then comes back", () => {
    check(
      A,
      B,
      [V(-50)],
      [
        [0, 0],
        [20, 0],
        [20, 40],
        [-50, 40],
        [-50, 80],
        [200, 80],
      ],
      [3],
    );
  });

  it("ROU-03c vertical ports: pins turn the shape by ninety degrees", () => {
    check(
      end(w(0, 0), DOWN),
      end(w(80, 200), UP),
      [H(60), H(140)],
      [
        [0, 0],
        [0, 20],
        [0, 60],
        [40, 60],
        [40, 140],
        [80, 140],
        [80, 200],
      ].filter((_, i) => i !== 1) as [number, number][],
      [1, 3],
    );
  });

  it("ROU-03c a duplicate pin on the same line is realized by the same segment", () => {
    check(
      A,
      B,
      [V(60), V(60)],
      [
        [0, 0],
        [60, 0],
        [60, 80],
        [200, 80],
      ],
      [1, 1],
    );
  });

  it("ROU-03a constraints of a router that ignores them leave routing unchanged when empty", () => {
    const plain = router.route({ from: A, to: B, constraints: [] });
    expect(plain.realized).toBeUndefined();
  });

  it("ROU-03c a pinned route that crosses its own node is complete and clear of nothing", () => {
    const level = end(w(200, 0), LEFT, box(200, -30, 100, 60));
    const r = router.route({ from: A, to: level, constraints: [V(-50)] });
    expect(verticesOf(r.path)).toEqual(
      pts([
        [0, 0],
        [20, 0],
        [20, 20],
        [-50, 20],
        [-50, 0],
        [200, 0],
      ]),
    );
    expect(r.outcome).toEqual({ status: "complete", clearOf: "nothing" });
  });
});

describe("ROU-03c, ROU-07, ROU-01c random pins", () => {
  it("1000 seeded inputs with 1 to 3 pins are deterministic, finite and axis-aligned, in either end order", () => {
    const rnd = seededRandom(7);
    const normals = [RIGHT, LEFT, UP, DOWN, w(0.8, 0.6), w(0, 0)];
    const pickNormal = () =>
      normals[Math.floor(rnd() * normals.length)] as Point<W>;
    for (let i = 0; i < 1000; i++) {
      const from = end(
        w(
          Math.round(between(rnd, -300, 300)),
          Math.round(between(rnd, -300, 300)),
        ),
        pickNormal(),
        rnd() < 0.7 ? box(-40, -20, 80, 40) : undefined,
      );
      const to = end(
        w(
          Math.round(between(rnd, -300, 300)),
          Math.round(between(rnd, -300, 300)),
        ),
        pickNormal(),
        rnd() < 0.7 ? box(100, 60, 80, 40) : undefined,
      );
      const count = 1 + Math.floor(rnd() * 3);
      const pins = Array.from({ length: count }, () =>
        (rnd() < 0.5 ? V : H)(Math.round(between(rnd, -400, 400))),
      );
      const first = both(from, to, pins);
      const second = both(from, to, pins);
      expect(first.forward).toEqual(second.forward);
      const v = verticesOf(first.forward.path);
      expect(v.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(
        true,
      );
      expect(isAxisAligned(first.forward.path)).toBe(true);
      expect(verticesOf(first.back.path)).toEqual([...v].reverse());
      expect(first.forward.realized).toHaveLength(count);
    }
  });
});
