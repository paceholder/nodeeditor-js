import { describe, expect, it } from "vitest";
import { rect } from "../geometry/spaces.js";
import { between, seededRandom } from "../geometry/test-utils.js";
import { createAabbTree } from "./aabb-tree.js";
import { createBruteForceIndex } from "./brute-force-index.js";
import { type SpatialIndex, sortKeys } from "./spatial-index.js";

type W = ReturnType<typeof rect<"world">>;

function randomBounds(rnd: () => number): W {
  return rect(
    Math.round(between(rnd, -2000, 2000)),
    Math.round(between(rnd, -2000, 2000)),
    Math.round(between(rnd, 0, 120)),
    Math.round(between(rnd, 0, 120)),
  );
}

function expectSame(
  a: SpatialIndex<string>,
  b: SpatialIndex<string>,
  rnd: () => number,
) {
  const q = randomBounds(rnd);
  const ra: string[] = [];
  const rb: string[] = [];
  a.queryRect(rect(q.x, q.y, q.w * 3, q.h * 3), ra);
  b.queryRect(rect(q.x, q.y, q.w * 3, q.h * 3), rb);
  expect(sortKeys(ra)).toEqual(sortKeys(rb));
  const pa: string[] = [];
  const pb: string[] = [];
  const radius = between(rnd, 0, 40);
  a.queryPoint({ x: q.x, y: q.y }, radius, pa);
  b.queryPoint({ x: q.x, y: q.y }, radius, pb);
  expect(sortKeys(pa)).toEqual(sortKeys(pb));
}

describe("IDX-01 AABB tree", () => {
  it("IDX-01 alternative implementation: 10k seeded operations match brute force", () => {
    const rnd = seededRandom(42);
    const tree = createAabbTree<string>();
    const ref = createBruteForceIndex<string>();
    const keys: string[] = [];
    for (let i = 0; i < 10_000; i++) {
      const roll = rnd();
      if (roll < 0.4 || keys.length < 20) {
        const key = `k${i}`;
        const b = randomBounds(rnd);
        tree.insert(key, b);
        ref.insert(key, b);
        keys.push(key);
      } else if (roll < 0.8) {
        const key = keys[Math.floor(rnd() * keys.length)] as string;
        const b = randomBounds(rnd);
        tree.update(key, b);
        ref.update(key, b);
      } else {
        const at = Math.floor(rnd() * keys.length);
        const [key] = keys.splice(at, 1) as [string];
        tree.remove(key);
        ref.remove(key);
      }
      expectSame(tree, ref, rnd);
      expect(tree.size).toBe(ref.size);
    }
    // Rotations keep the tree logarithmic, not a list.
    expect(tree.height()).toBeLessThan(5 * Math.log2(Math.max(2, tree.size)));
    // ~1.3 s alone; the default 5 s is too tight when the full suite runs in parallel.
  }, 30_000);

  it("IDX-01 handles empty trees, zero-size boxes and duplicate inserts", () => {
    const tree = createAabbTree<string>();
    const out: string[] = [];
    tree.queryRect(rect(-1e6, -1e6, 2e6, 2e6), out);
    expect(out).toEqual([]);
    tree.insert("a", rect(1, 1, 0, 0));
    tree.insert("a", rect(5, 5, 0, 0));
    expect(tree.size).toBe(1);
    tree.queryRect(rect(5, 5, 0, 0), out);
    expect(out).toEqual(["a"]);
    tree.remove("a");
    tree.remove("a");
    expect(tree.size).toBe(0);
    expect(tree.height()).toBe(0);
  });
});

describe("IDX-02 incremental update", () => {
  it("IDX-02 incremental update: jitter inside the fat box leaves the tree unchanged", () => {
    const tree = createAabbTree<string>({ fatMargin: 10 });
    for (let i = 0; i < 50; i++) tree.insert(`k${i}`, rect(i * 100, 0, 20, 20));
    const before = tree.height();
    for (let i = 0; i < 50; i++)
      tree.update(`k${i}`, rect(i * 100 + 3, 2, 20, 20));
    expect(tree.height()).toBe(before);
    // Queries still use the exact (tight) bounds, not the fat margin.
    const out: string[] = [];
    tree.queryRect(rect(95, 0, 2, 20), out);
    expect(out).toEqual([]);
    tree.queryRect(rect(103, 2, 1, 1), out);
    expect(out).toEqual(["k1"]);
  });
});

describe("IDX-04 deterministic results", () => {
  it("IDX-04 deterministic results: insertion order does not change sorted results", () => {
    const rnd = seededRandom(9);
    const entries = Array.from({ length: 300 }, (_, i) => ({
      key: `e${i}`,
      b: randomBounds(rnd),
    }));
    const shuffled = [...entries].sort(() => rnd() - 0.5);
    const one = createAabbTree<string>();
    const two = createAabbTree<string>();
    for (const e of entries) one.insert(e.key, e.b);
    for (const e of shuffled) two.insert(e.key, e.b);
    for (let i = 0; i < 100; i++) {
      const q = randomBounds(rnd);
      const area = rect<"world">(q.x, q.y, q.w * 8 + 50, q.h * 8 + 50);
      const a: string[] = [];
      const b: string[] = [];
      one.queryRect(area, a);
      two.queryRect(area, b);
      expect(sortKeys(a)).toEqual(sortKeys(b));
    }
  });
});
