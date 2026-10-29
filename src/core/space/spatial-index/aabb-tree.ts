/**
 * Dynamic AABB tree.
 *
 * A bounding-volume hierarchy whose leaves carry "fat" boxes: the tight bounds grown by
 * `fatMargin`. An update whose new tight bounds still fit inside the stored fat box is
 * O(1) and touches no tree node. Insertion picks a sibling by a perimeter heuristic and
 * AVL-style rotations keep the height logarithmic. Queries test the fat boxes while
 * descending and the exact tight bounds at the leaves, so results equal a linear scan.
 */
import {
  rectContainsRect,
  rectsIntersect,
  unionRects,
} from "../geometry/rect.js";
import type { Rect } from "../geometry/spaces.js";
import type { SpatialIndex } from "./spatial-index.js";

type W = "world";

interface TreeNode<K extends string> {
  box: Rect<W>;
  parent: TreeNode<K> | undefined;
  child1: TreeNode<K> | undefined;
  child2: TreeNode<K> | undefined;
  height: number;
  /** Leaves only. */
  key: K | undefined;
  tight: Rect<W>;
}

export interface AabbTreeOptions {
  /** Fat-box margin in world units. Default 8. */
  readonly fatMargin?: number;
}

export interface AabbTree<K extends string> extends SpatialIndex<K> {
  /** Tree height (0 for empty or a single leaf); for balance diagnostics. */
  height(): number;
}

const fatten = (r: Rect<W>, m: number): Rect<W> => ({
  x: r.x - m,
  y: r.y - m,
  w: r.w + 2 * m,
  h: r.h + 2 * m,
});

const perimeter = (r: Rect<W>): number => 2 * (r.w + r.h);

export function createAabbTree<K extends string>(
  options: AabbTreeOptions = {},
): AabbTree<K> {
  const margin = options.fatMargin ?? 8;
  const leaves = new Map<K, TreeNode<K>>();
  let root: TreeNode<K> | undefined;

  const isLeaf = (n: TreeNode<K>): boolean => n.child1 === undefined;
  const h = (n: TreeNode<K> | undefined): number => n?.height ?? 0;

  function refit(n: TreeNode<K>): void {
    const a = n.child1;
    const b = n.child2;
    if (!a || !b) return;
    n.box = unionRects(a.box, b.box);
    n.height = 1 + Math.max(a.height, b.height);
  }

  function replaceChild(
    parent: TreeNode<K> | undefined,
    oldChild: TreeNode<K>,
    next: TreeNode<K>,
  ): void {
    next.parent = parent;
    if (!parent) root = next;
    else if (parent.child1 === oldChild) parent.child1 = next;
    else parent.child2 = next;
  }

  /** Rotate the taller grandchild subtree up when children differ in height by > 1. */
  function balance(a: TreeNode<K>): TreeNode<K> {
    const b = a.child1;
    const c = a.child2;
    if (!b || !c || a.height < 2) return a;
    const diff = c.height - b.height;
    if (diff > 1) return rotateUp(a, c, "child2");
    if (diff < -1) return rotateUp(a, b, "child1");
    return a;
  }

  /** `up` is a's taller child; `slot` is the slot `up` occupied in `a`. */
  function rotateUp(
    a: TreeNode<K>,
    up: TreeNode<K>,
    slot: "child1" | "child2",
  ): TreeNode<K> {
    const f = up.child1;
    const g = up.child2;
    if (!f || !g) return a;
    up.child1 = a;
    replaceChild(a.parent, a, up);
    a.parent = up;
    const [keep, give] = f.height > g.height ? [f, g] : [g, f];
    up.child2 = keep;
    keep.parent = up;
    a[slot] = give;
    give.parent = a;
    refit(a);
    refit(up);
    return up;
  }

  function walkUp(start: TreeNode<K> | undefined): void {
    let n = start;
    while (n) {
      n = balance(n);
      refit(n);
      n = n.parent;
    }
  }

  function chooseSibling(leafBox: Rect<W>): TreeNode<K> {
    let n = root as TreeNode<K>;
    while (n.child1 && n.child2) {
      const area = perimeter(n.box);
      const combined = perimeter(unionRects(n.box, leafBox));
      const cost = 2 * combined;
      const inherit = 2 * (combined - area);
      const costOf = (c: TreeNode<K>): number => {
        const u = perimeter(unionRects(leafBox, c.box));
        return isLeaf(c) ? u + inherit : u - perimeter(c.box) + inherit;
      };
      const c1 = costOf(n.child1);
      const c2 = costOf(n.child2);
      if (cost < c1 && cost < c2) break;
      n = c1 < c2 ? n.child1 : n.child2;
    }
    return n;
  }

  function attach(leaf: TreeNode<K>): void {
    if (!root) {
      root = leaf;
      leaf.parent = undefined;
      return;
    }
    const sibling = chooseSibling(leaf.box);
    const oldParent = sibling.parent;
    const parent: TreeNode<K> = {
      box: unionRects(leaf.box, sibling.box),
      parent: oldParent,
      child1: sibling,
      child2: leaf,
      height: 1 + sibling.height,
      key: undefined,
      tight: leaf.tight,
    };
    replaceChild(oldParent, sibling, parent);
    sibling.parent = parent;
    leaf.parent = parent;
    walkUp(parent);
  }

  function detach(leaf: TreeNode<K>): void {
    if (leaf === root) {
      root = undefined;
      return;
    }
    const parent = leaf.parent as TreeNode<K>;
    const sibling = (
      parent.child1 === leaf ? parent.child2 : parent.child1
    ) as TreeNode<K>;
    const grand = parent.parent;
    replaceChild(grand, parent, sibling);
    walkUp(grand);
  }

  function upsert(key: K, bounds: Rect<W>): void {
    const existing = leaves.get(key);
    if (existing) {
      existing.tight = bounds;
      if (rectContainsRect(existing.box, bounds)) return;
      detach(existing);
      existing.box = fatten(bounds, margin);
      attach(existing);
      return;
    }
    const leaf: TreeNode<K> = {
      box: fatten(bounds, margin),
      parent: undefined,
      child1: undefined,
      child2: undefined,
      height: 0,
      key,
      tight: bounds,
    };
    leaves.set(key, leaf);
    attach(leaf);
  }

  function search(
    test: (box: Rect<W>) => boolean,
    hit: (n: TreeNode<K>) => void,
  ): void {
    if (!root) return;
    const stack: TreeNode<K>[] = [root];
    for (let n = stack.pop(); n; n = stack.pop()) {
      if (!test(n.box)) continue;
      if (n.child1 && n.child2) stack.push(n.child2, n.child1);
      else hit(n);
    }
  }

  return {
    insert: upsert,
    update: upsert,
    remove(key) {
      const leaf = leaves.get(key);
      if (!leaf) return;
      detach(leaf);
      leaves.delete(key);
    },
    queryRect(r, out) {
      search(
        (box) => rectsIntersect(box, r),
        (n) => {
          if (n.key !== undefined && rectsIntersect(n.tight, r))
            out.push(n.key);
        },
      );
    },
    queryPoint(p, radius, out) {
      const probe: Rect<W> = {
        x: p.x - radius,
        y: p.y - radius,
        w: 2 * radius,
        h: 2 * radius,
      };
      search(
        (box) => rectsIntersect(box, probe),
        (n) => {
          if (n.key !== undefined && rectsIntersect(n.tight, probe))
            out.push(n.key);
        },
      );
    },
    get size() {
      return leaves.size;
    },
    clear() {
      leaves.clear();
      root = undefined;
    },
    height: () => h(root),
  };
}
