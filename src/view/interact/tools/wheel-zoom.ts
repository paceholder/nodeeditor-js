/**
 * Wheel navigation (D8): cursor-anchored zoom, and pan in
 * the `"pan"` wheel mode. The input is only reported as handled when the viewport would
 * actually change, so the host can call `preventDefault` selectively and let the page
 * scroll at a zoom limit or in scroll mode.
 *
 * A pinch (a wheel with the Control key, which is how browsers report a trackpad pinch,
 * on macOS even with no key held) always zooms and is always handled, even at a limit:
 * otherwise the browser would zoom the whole page over the canvas.
 */
import type { RouteResult } from "./tool-router.js";
import type { ToolContext, ToolInput } from "./tool-types.js";

type WheelInput = Extract<ToolInput, { type: "wheel" }>;

/** Largest pinch delta one event may apply, in CSS pixels (a mouse notch is ~100). */
const MAX_PINCH_DELTA = 10;

const NOTHING: RouteResult = { effects: [], handled: false };

function zoomBy(
  input: WheelInput,
  ctx: ToolContext,
  exponent: number,
  consumed: boolean,
): RouteResult {
  const factor = Math.exp(exponent);
  const kept: RouteResult = { effects: [], handled: consumed };
  if (!Number.isFinite(factor) || factor <= 0 || factor === 1) return kept;
  const { min, max } = ctx.zoomRange;
  const target = Math.min(max, Math.max(min, ctx.zoom * factor));
  // At a limit the clamped zoom equals the current one: nothing to do.
  if (!Number.isFinite(target) || Math.abs(target - ctx.zoom) < 1e-12) {
    return kept;
  }
  return {
    effects: [
      {
        type: "viewport",
        op: { kind: "zoomAt", anchor: input.viewport, factor },
      },
    ],
    handled: true,
  };
}

export function wheelZoom(input: WheelInput, ctx: ToolContext): RouteResult {
  const { options } = ctx;
  if (input.pinch) {
    const delta = Math.max(
      -MAX_PINCH_DELTA,
      Math.min(MAX_PINCH_DELTA, input.deltaY),
    );
    return zoomBy(input, ctx, -delta * options.pinchSensitivity, true);
  }
  if (!input.modifiers.mod) {
    if (options.wheel === "scroll-page-unless-modifier") return NOTHING;
    if (options.wheel === "pan") {
      const dx = -(input.deltaX ?? 0);
      const dy = -input.deltaY;
      if (dx === 0 && dy === 0) return NOTHING;
      return {
        effects: [{ type: "viewport", op: { kind: "panBy", dx, dy } }],
        handled: true,
      };
    }
  }
  return zoomBy(input, ctx, -input.deltaY * options.wheelSensitivity, false);
}
