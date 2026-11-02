/**
 * Interaction thresholds and tool options (D4). Every distance here is in CSS
 * pixels of viewport space and does not change with zoom or device pixel ratio.
 */
import { type AutoPanOptions, DEFAULT_AUTO_PAN } from "./auto-pan.js";

export interface ToolOptions {
  /** Movement before a press becomes a drag. */
  readonly dragThresholdPx: { readonly mouse: number; readonly touch: number };
  /** Connection pick tolerance. */
  readonly pickTolerancePx: number;
  /** Move snapping grid step in world units; `undefined` disables snapping. */
  readonly gridStep: number | undefined;
  /**
   * Primary-button drag on empty canvas: `pan` scrolls the view and the marquee needs
   * Shift or the primary modifier; `marquee` selects and panning needs Space or the
   * middle button.
   */
  readonly emptyDrag: "pan" | "marquee";
  /** `direction`: left-to-right contains, right-to-left intersects (D5). */
  readonly marquee: "direction" | "contain" | "intersect";
  /** `scroll-page-unless-modifier`: the wheel zooms only with the primary modifier. */
  readonly wheel: "zoom" | "scroll-page-unless-modifier";
  /** Wheel zoom exponent: `factor = exp(-deltaY * wheelSensitivity)`. */
  readonly wheelSensitivity: number;
  /**
   * Pan the view while a node, connection, marquee or resize drag is near an edge;
   * `false` turns it off.
   */
  readonly autoPan: AutoPanOptions | false;
  /**
   * How long a still touch is held before it raises the context-menu event, in ms;
   * `false` turns long-press off. Armed only while a listener exists.
   */
  readonly longPressMs: number | false;
  /**
   * Largest gap between two presses on a route handle that count as a double-click, in
   * ms. The second press must also stay within the drag threshold.
   */
  readonly doubleClickMs: number;
}

export const DEFAULT_TOOL_OPTIONS: ToolOptions = {
  dragThresholdPx: { mouse: 3, touch: 6 },
  pickTolerancePx: 4,
  gridStep: undefined,
  emptyDrag: "pan",
  marquee: "direction",
  wheel: "zoom",
  wheelSensitivity: 0.0015,
  autoPan: DEFAULT_AUTO_PAN,
  longPressMs: 500,
  doubleClickMs: 500,
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
