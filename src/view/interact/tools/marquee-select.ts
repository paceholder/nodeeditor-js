/** Marquee candidate selection: broad phase from the scene, then containment or overlap. */
import {
  pathBounds,
  pathPointAt,
  type Rect,
  rectContainsPoint,
  rectContainsRect,
  rectsIntersect,
} from "../../../core/index.js";
import {
  connectionKey,
  groupKey,
  nodeKey,
  type SelectionKey,
} from "../selection/selection-model.js";
import type { ToolContext } from "./tool-types.js";

/** Path samples used for the intersection test; thin rectangles may miss tiny crossings. */
const PATH_SAMPLES = 48;

/**
 * Keys of entities inside `area`, in paint order (deterministic). `contain`
 * needs the whole hit bounds (or path bounds) inside; `intersect` needs any overlap
 * (nodes: hit bounds; connections: a sampled point of the path inside the rectangle).
 * Group frames follow, in document order, judged by the frame rectangle.
 */
export function marqueeKeys(
  area: Rect<"world">,
  mode: "contain" | "intersect",
  ctx: ToolContext,
): SelectionKey[] {
  const keys: SelectionKey[] = [];
  for (const item of ctx.scene.queryRect(area, "hit")) {
    if (item.kind === "node") {
      const entry = ctx.scene.node(item.id);
      if (!entry) continue;
      const hit =
        mode === "contain"
          ? rectContainsRect(area, entry.hitBounds)
          : rectsIntersect(area, entry.hitBounds);
      if (hit) keys.push(nodeKey(item.id));
      continue;
    }
    const path = ctx.scene.connection(item.id)?.path;
    if (!path) continue;
    let hit: boolean;
    if (mode === "contain") {
      hit = rectContainsRect(area, pathBounds(path));
    } else {
      hit = false;
      for (let i = 0; i <= PATH_SAMPLES && !hit; i++) {
        hit = rectContainsPoint(area, pathPointAt(path, i / PATH_SAMPLES));
      }
    }
    if (hit) keys.push(connectionKey(item.id));
  }
  if (ctx.options.groups !== false) {
    for (const group of ctx.scene.groups(area)) {
      const hit =
        mode === "contain"
          ? rectContainsRect(area, group.frame)
          : rectsIntersect(area, group.frame);
      if (hit) keys.push(groupKey(group.id));
    }
  }
  return keys;
}
