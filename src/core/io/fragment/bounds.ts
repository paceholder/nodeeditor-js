/**
 * Axis-aligned bounds of a fragment, computed from snapshot entries.
 *
 * A node's `position` is the world location of its body centre and `size` the unrotated
 * body size; an odd number of quarter turns swaps width and height. Port glyphs and
 * painter overhang are ignored: the box only centres a paste, so this is precise enough
 * and keeps `core/io` independent of `core/space`.
 */
import type { QuarterTurns, Size, Vec2 } from "../../data/model/values.js";

export interface FragmentBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface FramedEntry {
  readonly position: Vec2;
  readonly size: Size;
  readonly rotation?: QuarterTurns;
}

/** World-space frame of one node body. */
export function nodeFrame(node: FramedEntry): FragmentBounds {
  const odd = node.rotation === 1 || node.rotation === 3;
  const w = odd ? node.size.height : node.size.width;
  const h = odd ? node.size.width : node.size.height;
  return {
    minX: node.position.x - w / 2,
    minY: node.position.y - h / 2,
    maxX: node.position.x + w / 2,
    maxY: node.position.y + h / 2,
  };
}

/** Union of the node frames, or undefined for no nodes. */
export function fragmentBounds(
  nodes: readonly FramedEntry[],
): FragmentBounds | undefined {
  let out: FragmentBounds | undefined;
  for (const node of nodes) {
    const f = nodeFrame(node);
    out = out
      ? {
          minX: Math.min(out.minX, f.minX),
          minY: Math.min(out.minY, f.minY),
          maxX: Math.max(out.maxX, f.maxX),
          maxY: Math.max(out.maxY, f.maxY),
        }
      : f;
  }
  return out;
}

export function boundsCentre(bounds: FragmentBounds): Vec2 {
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  };
}
