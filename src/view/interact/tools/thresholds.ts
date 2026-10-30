/**
 * Interaction thresholds and tool options (D4). Every distance here is in CSS
 * pixels of viewport space and does not change with zoom or device pixel ratio.
 */

export interface ToolOptions {
  /** Movement before a press becomes a drag. */
  readonly dragThresholdPx: { readonly mouse: number; readonly touch: number };
  /** Connection pick tolerance. */
  readonly pickTolerancePx: number;
  /** Move snapping grid step in world units; `undefined` disables snapping. */
  readonly gridStep: number | undefined;
  /** `direction`: left-to-right contains, right-to-left intersects (D5). */
  readonly marquee: "direction" | "contain" | "intersect";
  /** `scroll-page-unless-modifier`: the wheel zooms only with the primary modifier. */
  readonly wheel: "zoom" | "scroll-page-unless-modifier";
  /** Wheel zoom exponent: `factor = exp(-deltaY * wheelSensitivity)`. */
  readonly wheelSensitivity: number;
}

export const DEFAULT_TOOL_OPTIONS: ToolOptions = {
  dragThresholdPx: { mouse: 3, touch: 6 },
  pickTolerancePx: 4,
  gridStep: undefined,
  marquee: "direction",
  wheel: "zoom",
  wheelSensitivity: 0.0015,
};

export function resolveToolOptions(
  over: Partial<ToolOptions> = {},
): ToolOptions {
  return { ...DEFAULT_TOOL_OPTIONS, ...over };
}

export function dragThreshold(
  options: ToolOptions,
  pointerType: "mouse" | "touch" | "pen" | undefined,
): number {
  return pointerType === "touch" || pointerType === "pen"
    ? options.dragThresholdPx.touch
    : options.dragThresholdPx.mouse;
}

/** Viewport-space distance between two points. */
export function distancePx(
  a: { readonly x: number; readonly y: number },
  b: { readonly x: number; readonly y: number },
): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
