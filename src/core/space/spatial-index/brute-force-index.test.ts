import { describe, expect, it } from "vitest";
import { rect } from "../geometry/spaces.js";
import { createBruteForceIndex } from "./brute-force-index.js";
import { sortKeys } from "./spatial-index.js";

describe("IDX-01 brute-force reference index", () => {
  it("IDX-01 rectangle query returns exactly the intersecting entries", () => {
    const idx = createBruteForceIndex<string>();
    for (let i = 0; i < 100; i++) idx.insert(`k${i}`, rect(i * 10, 0, 5, 5));
    const out: string[] = [];
    idx.queryRect(rect(100, 0, 30, 5), out);
    // Boundary-inclusive: k9 ends at 95 (outside), k10..k13 start at 100..130.
    expect(sortKeys(out)).toEqual(["k10", "k11", "k12", "k13"]);
    expect(idx.size).toBe(100);
  });

  it("IDX-01 point query grows entries by the radius; remove and update work", () => {
    const idx = createBruteForceIndex<string>();
    idx.insert("a", rect(0, 0, 10, 10));
    idx.insert("b", rect(100, 100, 0, 0));
    const near: string[] = [];
    idx.queryPoint({ x: 13, y: 5 }, 3, near);
    expect(near).toEqual(["a"]);
    idx.update("a", rect(50, 50, 1, 1));
    idx.remove("b");
    idx.remove("missing");
    const none: string[] = [];
    idx.queryPoint({ x: 13, y: 5 }, 3, none);
    expect(none).toEqual([]);
    expect(idx.size).toBe(1);
    idx.clear();
    expect(idx.size).toBe(0);
  });
});
