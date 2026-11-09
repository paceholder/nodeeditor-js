import { describe, expect, it } from "vitest";
import { resolveToolOptions, type ToolOptions } from "./thresholds.js";
import {
  NO_MODIFIERS,
  type ToolContext,
  type ToolInput,
} from "./tool-types.js";
import { wheelZoom } from "./wheel-zoom.js";

type Wheel = Extract<ToolInput, { type: "wheel" }>;

function ctxOf(
  zoom: number,
  over: Partial<ToolOptions> = {},
  range = { min: 0.1, max: 4 },
): ToolContext {
  return {
    zoom,
    zoomRange: range,
    options: resolveToolOptions(over),
  } as unknown as ToolContext;
}

const wheel = (over: Partial<Wheel>): Wheel => ({
  type: "wheel",
  viewport: { x: 10, y: 20 } as Wheel["viewport"],
  deltaX: 0,
  deltaY: 0,
  pinch: false,
  modifiers: NO_MODIFIERS,
  ...over,
});

const zoomFactor = (r: ReturnType<typeof wheelZoom>): number | undefined => {
  const op = r.effects[0];
  return op?.type === "viewport" && op.op.kind === "zoomAt"
    ? op.op.factor
    : undefined;
};

describe("control-wheel zoom over the canvas", () => {
  it("a pinch at the zoom limit changes nothing but is still consumed", () => {
    const r = wheelZoom(wheel({ deltaY: -5, pinch: true }), ctxOf(4));
    expect(r.handled).toBe(true);
    expect(r.effects).toEqual([]);
    // A plain wheel at the limit still lets the page scroll.
    expect(wheelZoom(wheel({ deltaY: -5 }), ctxOf(4)).handled).toBe(false);
  });

  it("a pinch zooms in scroll-page mode, where a plain wheel does not", () => {
    const ctx = ctxOf(1, { wheel: "scroll-page-unless-modifier" });
    expect(wheelZoom(wheel({ deltaY: -5 }), ctx).handled).toBe(false);
    const r = wheelZoom(wheel({ deltaY: -5, pinch: true }), ctx);
    expect(r.handled).toBe(true);
    expect(zoomFactor(r)).toBeCloseTo(Math.exp(5 * 0.01), 9);
  });

  it("a pinch zooms with its own sensitivity and a clamped delta per event", () => {
    const ctx = ctxOf(1, { pinchSensitivity: 0.02 });
    expect(zoomFactor(wheelZoom(wheel({ deltaY: 3, pinch: true }), ctx))).toBe(
      Math.exp(-3 * 0.02),
    );
    // A Control-wheel notch of a mouse (100 px) zooms by the clamp, not by e^-2.
    expect(
      zoomFactor(wheelZoom(wheel({ deltaY: 100, pinch: true }), ctx)),
    ).toBe(Math.exp(-10 * 0.02));
  });
});

describe("trackpad pan mode", () => {
  it("a diagonal plain wheel pans both ways and never zooms", () => {
    const r = wheelZoom(
      wheel({ deltaX: 30, deltaY: -12 }),
      ctxOf(1, { wheel: "pan" }),
    );
    expect(r.handled).toBe(true);
    expect(r.effects).toEqual([
      { type: "viewport", op: { kind: "panBy", dx: -30, dy: 12 } },
    ]);
  });

  it("the primary modifier and a pinch zoom in pan mode", () => {
    const ctx = ctxOf(1, { wheel: "pan" });
    const mod = wheelZoom(
      wheel({ deltaY: -40, modifiers: { ...NO_MODIFIERS, mod: true } }),
      ctx,
    );
    expect(zoomFactor(mod)).toBeCloseTo(Math.exp(40 * 0.0015), 9);
    expect(zoomFactor(wheelZoom(wheel({ deltaY: -4, pinch: true }), ctx))).toBe(
      Math.exp(4 * 0.01),
    );
  });

  it("zoom mode keeps zooming on a plain wheel and ignores horizontal delta", () => {
    const r = wheelZoom(wheel({ deltaX: 50, deltaY: -40 }), ctxOf(1));
    expect(r.effects).toHaveLength(1);
    expect(zoomFactor(r)).toBeCloseTo(Math.exp(40 * 0.0015), 9);
    expect(wheelZoom(wheel({ deltaX: 50 }), ctxOf(1)).handled).toBe(false);
  });
});
