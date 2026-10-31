import { describe, expect, it } from "vitest";
import {
  anchoredPosition,
  frameVector,
  frameVectorInverse,
  type NodeFrame,
  type ResizeFixed,
} from "./node-frame.js";
import type { QuarterTurns, Size, Vec2 } from "./values.js";

const TURNS: QuarterTurns[] = [0, 1, 2, 3];
const FRAMES: NodeFrame[] = TURNS.flatMap((rotation) => [
  { rotation, mirrored: false },
  { rotation, mirrored: true },
]);
const STEPS = [-1, 0, 1] as const;
const FIXED: ResizeFixed[] = STEPS.flatMap((x) => STEPS.map((y) => ({ x, y })));

/** World position of the local point `fixed` of a node's body box. */
function worldOf(
  node: NodeFrame & { position: Vec2; size: Size },
  fixed: ResizeFixed,
): Vec2 {
  const v = frameVector(node, {
    x: (fixed.x * node.size.width) / 2,
    y: (fixed.y * node.size.height) / 2,
  });
  return { x: node.position.x + v.x, y: node.position.y + v.y };
}

describe("node frame and anchored resize", () => {
  it("keeps each of the nine fixed points in place for all eight frames", () => {
    for (const frame of FRAMES) {
      const node = {
        ...frame,
        position: { x: 100, y: 50 },
        size: { width: 40, height: 20 },
      };
      const size = { width: 70, height: 26 };
      for (const fixed of FIXED) {
        const position = anchoredPosition(node, size, fixed);
        expect(worldOf({ ...node, position, size }, fixed)).toEqual(
          worldOf(node, fixed),
        );
      }
    }
  });

  it("defaults to the centre, which never moves", () => {
    const node = {
      rotation: 1 as const,
      mirrored: true,
      position: { x: 3, y: 4 },
      size: { width: 10, height: 10 },
    };
    expect(anchoredPosition(node, { width: 30, height: 2 })).toEqual({
      x: 3,
      y: 4,
    });
  });

  it("moves the centre by half the size change along the fixed edge's normal", () => {
    // A quarter turn after the mirror: local +x points to world -y.
    const node = {
      rotation: 1 as const,
      mirrored: true,
      position: { x: 0, y: 0 },
      size: { width: 40, height: 20 },
    };
    const position = anchoredPosition(
      node,
      { width: 60, height: 20 },
      { x: -1, y: 0 },
    );
    expect(Math.hypot(position.x, position.y)).toBe(10);
    expect(position).toEqual(frameVector(node, { x: 10, y: 0 }));
  });

  it("inverts the frame map exactly", () => {
    for (const frame of FRAMES) {
      const v = { x: 3, y: -7 };
      expect(frameVectorInverse(frame, frameVector(frame, v))).toEqual(v);
      expect(frameVector(frame, frameVectorInverse(frame, v))).toEqual(v);
    }
  });
});
