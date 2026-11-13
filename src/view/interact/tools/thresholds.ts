/**
 * Interaction thresholds and tool options (D4). Every distance here is in CSS
 * pixels of viewport space and does not change with zoom or device pixel ratio.
 */
import { deepFreeze } from "../../platform/deep-freeze.js";
import { type AutoPanOptions, DEFAULT_AUTO_PAN } from "./auto-pan.js";

/** How group frames respond to the pointer. */
export interface GroupOptions {
  /**
   * Dropping a dragged free node on a group adds it, and dropping a member clear of the
   * other members removes it. Off: a drag never changes membership.
   */
  readonly dragMembership: boolean;
  /**
   * Double-click on a title and F2 open the built-in text editor. Off: the view raises
   * the `group-title-edit` event instead, for a host editor.
   */
  readonly titleEditor: boolean;
}

export const DEFAULT_GROUP_OPTIONS: GroupOptions = deepFreeze({
  dragMembership: true,
  titleEditor: true,
});

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
  /**
   * What a plain wheel does. `zoom` zooms at the cursor. `scroll-page-unless-modifier`
   * leaves it to the page and zooms only with the primary modifier. `pan` pans the view by
   * both deltas (two-finger trackpad scrolling) and zooms with the primary modifier. A
   * pinch (Control-wheel) zooms in every mode.
   */
  readonly wheel: "zoom" | "scroll-page-unless-modifier" | "pan";
  /** Wheel zoom exponent: `factor = exp(-deltaY * wheelSensitivity)`. */
  readonly wheelSensitivity: number;
  /**
   * Pinch (Control-wheel) zoom exponent per CSS pixel of delta, applied to a delta clamped
   * to ±10 per event. Pinch deltas are small, so it is larger than `wheelSensitivity`.
   */
  readonly pinchSensitivity: number;
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
  /**
   * Group frame interaction; `false` leaves frames painted but not interactive (no
   * selection, drag, lock click or title editing by pointer).
   */
  readonly groups: GroupOptions | false;
}

export const DEFAULT_TOOL_OPTIONS: ToolOptions = deepFreeze({
  dragThresholdPx: { mouse: 3, touch: 6 },
  pickTolerancePx: 4,
  gridStep: undefined,
  emptyDrag: "pan",
  marquee: "direction",
  wheel: "zoom",
  wheelSensitivity: 0.0015,
  pinchSensitivity: 0.01,
  autoPan: DEFAULT_AUTO_PAN,
  longPressMs: 500,
  doubleClickMs: 500,
  groups: DEFAULT_GROUP_OPTIONS,
});

/** `ToolOptions` as a host gives them: nested group options may be partial. */
export type ToolOptionsInput = Partial<Omit<ToolOptions, "groups">> & {
  readonly groups?: Partial<GroupOptions> | false;
};

export function resolveToolOptions(over: ToolOptionsInput = {}): ToolOptions {
  const { groups, ...rest } = over;
  return {
    ...DEFAULT_TOOL_OPTIONS,
    ...rest,
    groups: groups === false ? false : { ...DEFAULT_GROUP_OPTIONS, ...groups },
  };
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
