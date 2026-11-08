/**
 * Cursor-anchored wheel zoom (D8). The input is only reported as
 * handled when the viewport would actually change, so the host can call `preventDefault`
 * selectively and let the page scroll at a zoom limit or in scroll mode.
 */
import type { RouteResult } from "./tool-router.js";
import type { ToolContext, ToolInput } from "./tool-types.js";

type WheelInput = Extract<ToolInput, { type: "wheel" }>;

export function wheelZoom(input: WheelInput, ctx: ToolContext): RouteResult {
  const { options } = ctx;
  if (options.wheel === "scroll-page-unless-modifier" && !input.modifiers.mod) {
    return { effects: [], handled: false };
  }
  const factor = Math.exp(-input.deltaY * options.wheelSensitivity);
  if (!Number.isFinite(factor) || factor <= 0 || factor === 1) {
    return { effects: [], handled: false };
  }
  const { min, max } = ctx.zoomRange;
  const target = Math.min(max, Math.max(min, ctx.zoom * factor));
  // At a limit the clamped zoom equals the current one: nothing to do, page scrolls.
  if (!Number.isFinite(target) || Math.abs(target - ctx.zoom) < 1e-12) {
    return { effects: [], handled: false };
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
