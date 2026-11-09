import { describe, expect, it } from "vitest";
import { rect } from "../geometry/spaces.js";
import { createAabbTree } from "./aabb-tree.js";

describe("enlarged index boxes shrink with their entries", () => {
  it("an entry resized from very large to small gets a fitted box", () => {
    const tree = createAabbTree<string>({ fatMargin: 8 });
    tree.insert("a", rect<"world">(-5000, -5000, 10000, 10000));
    tree.update("a", rect<"world">(-5, -5, 10, 10));
    expect(tree.boxOf("a")).toEqual(rect(-13, -13, 26, 26));
  });

  it("a small move inside the enlarged box keeps the stored box", () => {
    const tree = createAabbTree<string>({ fatMargin: 8 });
    tree.insert("a", rect<"world">(0, 0, 10, 10));
    const before = tree.boxOf("a");
    tree.update("a", rect<"world">(2, 3, 10, 10));
    expect(tree.boxOf("a")).toEqual(before);
    const out: string[] = [];
    tree.queryRect(rect<"world">(11.5, 12.5, 1, 1), out);
    expect(out).toEqual(["a"]);
  });
});
