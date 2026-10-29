/**
 * The node transform.
 *
 *   world = T(position) . R(quarterTurns * 90deg clockwise) . M(mirrored)
 *
 * Mirroring flips x and is applied first, about the node-local origin. The origin is the
 * node's BODY CENTER, so rotation and mirroring keep the node in place; `position` is the
 * world location of that origin. Quarter turns use exact 0 and +-1 matrix entries, so no
 * trigonometric rounding happens and four turns return a point bit-identical. Normals use
 * the linear part only and stay unit length because that part is orthonormal.
 */
import type { QuarterTurns, Vec2 } from "../../data/model/values.js";
import { type Affine2, affine } from "./affine.js";

/** [cos, sin] of a clockwise quarter turn in a y-down space. */
const TURN: Readonly<Record<QuarterTurns, readonly [number, number]>> = {
  0: [1, 0],
  1: [0, 1],
  2: [-1, 0],
  3: [0, -1],
};

export interface NodePlacement {
  readonly position: Vec2;
  readonly rotation: QuarterTurns;
  readonly mirrored: boolean;
}

export function nodeTransform(
  placement: NodePlacement,
): Affine2<"local", "world"> {
  const [cos, sin] = TURN[placement.rotation];
  const m = placement.mirrored ? -1 : 1;
  // Columns of R*M: R*(m,0) and R*(0,1). `+ 0` removes negative zeros.
  return affine(
    cos * m + 0,
    sin * m + 0,
    -sin + 0,
    cos + 0,
    placement.position.x,
    placement.position.y,
  );
}
