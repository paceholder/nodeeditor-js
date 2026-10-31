/**
 * The linear part of the node frame and anchored resizing (NOD-04, NOD-04a).
 *
 *   L = R(rotation * 90deg clockwise) . M(mirrored)
 *
 * the same map as the linear part of `nodeTransform` in `core/space`, kept here because
 * planners and the capability validator in `core/edit` may not import `core/space`. A
 * test asserts that both agree for all eight rotation and mirror states. Entries are
 * exact 0 and +-1, so no rounding happens.
 */
import type { NodeRecord } from "./records.js";
import type { QuarterTurns, Size, Vec2 } from "./values.js";

/** Rotation and mirroring of a node: everything `L` depends on. */
export interface NodeFrame {
  readonly rotation: QuarterTurns;
  readonly mirrored: boolean;
}

/**
 * A point of the unrotated body box that keeps its world position during a resize:
 * `x = -1` is the local left edge, `1` the right edge, `0` the centre line; `y` likewise
 * for top and bottom. Local frame, before rotation and mirroring.
 */
export interface ResizeFixed {
  readonly x: -1 | 0 | 1;
  readonly y: -1 | 0 | 1;
}

/** The body centre. */
export const CENTER_FIXED: ResizeFixed = { x: 0, y: 0 };

/** [cos, sin] of a clockwise quarter turn in a y-down space. */
const TURN: Readonly<Record<QuarterTurns, readonly [number, number]>> = {
  0: [1, 0],
  1: [0, 1],
  2: [-1, 0],
  3: [0, -1],
};

/** Local vector to world vector: `L · v`. `+ 0` removes negative zeros. */
export function frameVector(frame: NodeFrame, v: Vec2): Vec2 {
  const [cos, sin] = TURN[frame.rotation];
  const x = frame.mirrored ? -v.x : v.x;
  return { x: cos * x - sin * v.y + 0, y: sin * x + cos * v.y + 0 };
}

/** World vector to local vector: `L⁻¹ · v = M · R(-rotation) · v`. */
export function frameVectorInverse(frame: NodeFrame, v: Vec2): Vec2 {
  const [cos, sin] = TURN[frame.rotation];
  const x = cos * v.x + sin * v.y;
  const y = -sin * v.x + cos * v.y;
  return { x: (frame.mirrored ? -x : x) + 0, y: y + 0 };
}

/**
 * The node centre after resizing `node` to `size` with the local point `fixed` kept in
 * place: `position + L · (-fixed.x · Δw / 2, -fixed.y · Δh / 2)`.
 */
export function anchoredPosition(
  node: Pick<NodeRecord, "position" | "size" | "rotation" | "mirrored">,
  size: Size,
  fixed: ResizeFixed = CENTER_FIXED,
): Vec2 {
  const local = {
    x: (-fixed.x * (size.width - node.size.width)) / 2,
    y: (-fixed.y * (size.height - node.size.height)) / 2,
  };
  const shift = frameVector(node, local);
  return {
    x: node.position.x + shift.x,
    y: node.position.y + shift.y,
  };
}

/** A screen axis to mirror across (NOD-04). */
export type MirrorAxis = "horizontal" | "vertical";

/**
 * The rotation after a screen-axis mirror (NOD-04). With `world = R(r) . M(m)`, the
 * screen flip `H` (left and right) gives `H . R(r) = R(-r) . H`, and `V = R(2) . H`, so
 * a horizontal mirror stores `-r` and a vertical mirror `2 - r`, each with `!m`.
 */
export function mirroredRotation(
  rotation: QuarterTurns,
  axis: MirrorAxis,
): QuarterTurns {
  const base = axis === "vertical" ? 6 : 4;
  return ((base - rotation) % 4) as QuarterTurns;
}
