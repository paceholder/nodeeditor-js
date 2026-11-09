import { describe, expect, it } from "vitest";
import { DEFAULT_THEME } from "../theme/tokens.js";
import { createPaintFrame } from "./frame.js";
import { gridLevel, paintGrid } from "./grid.js";

describe("background grid density", () => {
  it("keeps the base step while lines are far enough apart", () => {
    expect(gridLevel(20, 5, 1)).toEqual({
      minorStep: 20,
      majorEvery: 5,
      minorAlpha: 1,
    });
  });

  it("steps up by the major ratio as the view zooms out", () => {
    expect(gridLevel(20, 5, 0.3)?.minorStep).toBe(100);
    expect(gridLevel(20, 5, 0.05)?.minorStep).toBe(500);
    expect(gridLevel(20, 5, 0.005)?.minorStep).toBe(2500);
  });

  it("on-screen minor gap stays within [8, 40) px at any zoom", () => {
    for (let zoom = 0.001; zoom <= 4; zoom *= 1.07) {
      const level = gridLevel(20, 5, zoom);
      const gap = (level?.minorStep ?? 0) * zoom;
      expect(gap).toBeGreaterThanOrEqual(8);
      expect(gap).toBeLessThan(Math.max(40, 20 * zoom + 1e-9));
    }
  });

  it("minor lines fade in from the minimum gap", () => {
    // 100 world units at zoom 0.08 is exactly 8 px: minors invisible.
    expect(gridLevel(20, 5, 0.08)?.minorAlpha).toBeCloseTo(0);
    expect(gridLevel(20, 5, 0.12)?.minorAlpha).toBeCloseTo(0.5);
    expect(gridLevel(20, 5, 0.16)?.minorAlpha).toBe(1);
  });

  it("a major-every of 1 still steps up by 2", () => {
    expect(gridLevel(20, 1, 0.3)).toMatchObject({
      minorStep: 40,
      majorEvery: 1,
    });
  });

  it("an unusable step or zoom draws no grid", () => {
    expect(gridLevel(0, 5, 1)).toBeUndefined();
    expect(gridLevel(Number.NaN, 5, 1)).toBeUndefined();
    expect(gridLevel(20, 5, 0)).toBeUndefined();
  });
});

describe("grid lines on device pixels", () => {
  it("every line sits on a device pixel centre at a pixel ratio of 1.5", () => {
    const dpr = 1.5;
    const frame = createPaintFrame(
      { width: 301, height: 203, dpr },
      { zoom: 1.37, panX: 13.3, panY: -7.9 },
      DEFAULT_THEME,
    );
    const xs: number[] = [];
    const ys: number[] = [];
    const ctx = {
      setTransform() {},
      fillRect() {},
      beginPath() {},
      stroke() {},
      moveTo(x: number, y: number) {
        if (y === 0) xs.push(x);
        else ys.push(y);
      },
      lineTo() {},
    } as unknown as CanvasRenderingContext2D;
    paintGrid(ctx, frame);
    expect(xs.length).toBeGreaterThan(5);
    expect(ys.length).toBeGreaterThan(5);
    for (const css of [...xs, ...ys]) {
      const device = css * dpr;
      expect(device - Math.floor(device)).toBeCloseTo(0.5, 9);
    }
  });
});
