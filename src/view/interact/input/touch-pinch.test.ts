import { describe, expect, it } from "vitest";
import { type Point, type Viewport, zoomAt } from "../../../core/index.js";
import type { ViewportOp } from "../tools/tool-types.js";
import {
  PINCH_IDLE,
  type PinchInput,
  type PinchState,
  pinchStep,
} from "./touch-pinch.js";

const P = (x: number, y: number) => ({ x, y }) as Point<"viewport">;

/** Feed inputs, applying the viewport ops as the view would. */
function run(inputs: readonly PinchInput[], start: Viewport) {
  let state: PinchState = PINCH_IDLE;
  let viewport = start;
  let starts = 0;
  const apply = (op: ViewportOp): void => {
    if (op.kind === "panBy") {
      viewport = {
        ...viewport,
        panX: viewport.panX + op.dx,
        panY: viewport.panY + op.dy,
      };
    } else if (op.kind === "zoomAt") {
      const next = zoomAt(viewport, viewport.zoom * op.factor, op.anchor);
      if (next.ok) viewport = next.value;
    } else viewport = op.viewport;
  };
  for (const input of inputs) {
    const step = pinchStep(state, input);
    state = step.state;
    if (step.started) starts++;
    for (const op of step.ops) apply(op);
  }
  return { state, viewport, starts };
}

describe("touch pinch zoom", () => {
  it("spreading two touches to twice their distance doubles the zoom about their midpoint", () => {
    const r = run(
      [
        { type: "down", pointerId: 1, at: P(100, 100) },
        { type: "down", pointerId: 2, at: P(200, 100) },
        { type: "move", pointerId: 1, at: P(50, 100) },
        { type: "move", pointerId: 2, at: P(250, 100) },
      ],
      { zoom: 1, panX: 0, panY: 0 },
    );
    expect(r.starts).toBe(1);
    expect(r.viewport.zoom).toBeCloseTo(2, 9);
    // The world point under the midpoint (150, 100) stays under it.
    expect(150 * r.viewport.zoom + r.viewport.panX).toBeCloseTo(150, 9);
    expect(100 * r.viewport.zoom + r.viewport.panY).toBeCloseTo(100, 9);
  });

  it("moving both touches together pans by the midpoint's motion", () => {
    const r = run(
      [
        { type: "down", pointerId: 1, at: P(100, 100) },
        { type: "down", pointerId: 2, at: P(200, 100) },
        { type: "move", pointerId: 1, at: P(130, 140) },
        { type: "move", pointerId: 2, at: P(230, 140) },
      ],
      { zoom: 1, panX: 0, panY: 0 },
    );
    expect(r.viewport.zoom).toBeCloseTo(1, 9);
    expect(r.viewport.panX).toBeCloseTo(30, 9);
    expect(r.viewport.panY).toBeCloseTo(40, 9);
  });

  it("one touch alone does nothing, and lifting either touch ends the pinch", () => {
    const one = run(
      [
        { type: "down", pointerId: 1, at: P(100, 100) },
        { type: "move", pointerId: 1, at: P(150, 100) },
      ],
      { zoom: 1, panX: 0, panY: 0 },
    );
    expect(one.starts).toBe(0);
    expect(one.viewport).toEqual({ zoom: 1, panX: 0, panY: 0 });
    const lifted = run(
      [
        { type: "down", pointerId: 1, at: P(100, 100) },
        { type: "down", pointerId: 2, at: P(200, 100) },
        { type: "up", pointerId: 2 },
        // The remaining touch does nothing until it lifts too.
        { type: "move", pointerId: 1, at: P(10, 10) },
      ],
      { zoom: 1, panX: 0, panY: 0 },
    );
    expect(lifted.viewport).toEqual({ zoom: 1, panX: 0, panY: 0 });
    expect(lifted.state.kind).toBe("spent");
    const done = pinchStep(lifted.state, { type: "up", pointerId: 1 });
    expect(done.state).toEqual(PINCH_IDLE);
  });

  it("a third touch is ignored while two pinch", () => {
    const r = run(
      [
        { type: "down", pointerId: 1, at: P(100, 100) },
        { type: "down", pointerId: 2, at: P(200, 100) },
        { type: "down", pointerId: 3, at: P(300, 300) },
        { type: "move", pointerId: 3, at: P(0, 0) },
      ],
      { zoom: 1, panX: 0, panY: 0 },
    );
    expect(r.starts).toBe(1);
    expect(r.viewport).toEqual({ zoom: 1, panX: 0, panY: 0 });
  });
});
