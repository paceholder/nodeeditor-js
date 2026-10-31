import { describe, expect, it } from "vitest";
import {
  armedVelocity,
  autoPanVelocity,
  DEFAULT_AUTO_PAN,
  startArm,
  updateArm,
} from "./auto-pan.js";
import { DEFAULT_TOOL_OPTIONS } from "./thresholds.js";

const SIZE = { width: 800, height: 600 };
const v = (x: number, y: number) =>
  autoPanVelocity({ x, y }, SIZE, DEFAULT_AUTO_PAN);

describe("auto-pan velocity", () => {
  it("is on by default with a 32 px band and 600 px/s", () => {
    expect(DEFAULT_TOOL_OPTIONS.autoPan).toEqual({
      edgePx: 32,
      maxSpeedPxPerSecond: 600,
    });
  });

  it("is zero outside the band", () => {
    expect(v(400, 300)).toEqual({ x: 0, y: 0 });
    expect(v(32, 568)).toEqual({ x: 0, y: 0 });
  });

  it("rises linearly inside the band toward each edge", () => {
    expect(v(800 - 16, 300)).toEqual({ x: 300, y: 0 });
    expect(v(800 - 8, 300)).toEqual({ x: 450, y: 0 });
    expect(v(16, 300)).toEqual({ x: -300, y: 0 });
    expect(v(400, 8)).toEqual({ x: 0, y: -450 });
    expect(v(400, 600)).toEqual({ x: 0, y: 600 });
  });

  it("Bounded speed: capped when the pointer is far outside the view", () => {
    expect(v(5000, 300)).toEqual({ x: 600, y: 0 });
    expect(v(-5000, -5000)).toEqual({ x: -600, y: -600 });
  });

  it("pans diagonally in a corner", () => {
    expect(v(800 - 16, 600 - 16)).toEqual({ x: 300, y: 300 });
  });

  it("Auto-pan turned off: false gives no velocity anywhere", () => {
    expect(autoPanVelocity({ x: 9000, y: 0 }, SIZE, false)).toEqual({
      x: 0,
      y: 0,
    });
  });
});

describe("auto-pan arming", () => {
  const opts = DEFAULT_AUTO_PAN;

  it("a gesture that starts outside the band is armed at once", () => {
    const arm = startArm({ x: 400, y: 300 }, SIZE, opts);
    expect(arm.armed).toBe(true);
    expect(armedVelocity(arm, { x: 790, y: 300 }, SIZE, opts).x).toBe(412.5);
  });

  it("a gesture that starts in the band does not pan until armed", () => {
    let arm = startArm({ x: 790, y: 300 }, SIZE, opts);
    expect(armedVelocity(arm, { x: 790, y: 300 }, SIZE, opts)).toEqual({
      x: 0,
      y: 0,
    });
    // Moving away from the edge, still inside the band: not armed.
    arm = updateArm(arm, { x: 780, y: 300 }, SIZE, opts);
    expect(arm.armed).toBe(false);
    // Closer to the edge than where it started: armed.
    arm = updateArm(arm, { x: 795, y: 300 }, SIZE, opts);
    expect(arm.armed).toBe(true);
    expect(
      armedVelocity(arm, { x: 795, y: 300 }, SIZE, opts).x,
    ).toBeGreaterThan(0);
  });

  it("leaving the band arms the gesture", () => {
    let arm = startArm({ x: 790, y: 300 }, SIZE, opts);
    arm = updateArm(arm, { x: 600, y: 300 }, SIZE, opts);
    expect(arm.armed).toBe(true);
  });
});
