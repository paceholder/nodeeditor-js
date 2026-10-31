import { describe, expect, it } from "vitest";
import { frameVector } from "../../data/model/node-frame.js";
import type { QuarterTurns } from "../../data/model/values.js";
import { applyVector } from "./affine.js";
import { nodeTransform } from "./node-transform.js";

const TURNS: QuarterTurns[] = [0, 1, 2, 3];

describe("NOD-04 node frame agrees with the node transform", () => {
  it("frameVector equals the linear part of nodeTransform in all eight states", () => {
    for (const rotation of TURNS) {
      for (const mirrored of [false, true]) {
        const t = nodeTransform({
          position: { x: 11, y: -5 },
          rotation,
          mirrored,
        });
        for (const v of [
          { x: 1, y: 0 },
          { x: 0, y: 1 },
          { x: 3, y: -7 },
        ]) {
          expect(frameVector({ rotation, mirrored }, v)).toEqual(
            applyVector(t, v),
          );
        }
      }
    }
  });
});
