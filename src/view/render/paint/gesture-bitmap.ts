/**
 * Gesture bitmap reuse (LAY-05, opt-in).
 *
 * After each exact scene paint with a large visible set, the scene canvas is copied into
 * an offscreen canvas together with the viewport it was painted with. A frame whose only
 * scene reason is a viewport change then draws that copy with the viewport delta transform
 * instead of repainting every entity. One settle timer, restarted on each viewport change,
 * asks for an exact repaint once the viewport has rested; the exact paint clears it, so an
 * idle view requests no frames (PERF-02d). A frame whose zoom ratio to the copy or
 * uncovered area exceeds the configured limits paints exactly, which refreshes the copy,
 * so a gesture that never rests stays close to an exact frame.
 *
 * Areas the copy did not cover show only the background until the settle repaint. Picking
 * never reads the copy: it always uses the geometry scene.
 */
import type { Viewport } from "../../../core/index.js";

/** Mount option: `gestureBitmap`. Off when absent. */
export interface GestureBitmapOptions {
  /** Visible nodes plus connections at the last exact paint needed for reuse. Default 3000. */
  readonly minVisible?: number;
  /** Rest time after the last viewport change before the exact repaint. Default 120 ms. */
  readonly settleMs?: number;
  /**
   * Largest zoom ratio between the current viewport and the stored frame, applied both
   * ways (1.25 allows 0.8 to 1.25). Beyond it the frame is exact. Default 1.25.
   */
  readonly maxZoomRatio?: number;
  /** Largest fraction of the view the moved copy may leave uncovered. Default 0.25. */
  readonly maxUncovered?: number;
}

export const DEFAULT_GESTURE_BITMAP = {
  minVisible: 3000,
  settleMs: 120,
  maxZoomRatio: 1.25,
  maxUncovered: 0.25,
} as const;

/** Device transform from the stored frame to `viewport`: scale `k`, offset `(e, f)`. */
export interface CopyTransform {
  readonly k: number;
  readonly e: number;
  readonly f: number;
}

export function copyTransform(
  from: Viewport,
  to: Viewport,
  dpr: number,
): CopyTransform {
  // device_new = k * device_old + dpr * (pan_new - k * pan_old), k = zoom ratio.
  const k = to.zoom / from.zoom;
  return {
    k,
    e: dpr * (to.panX - k * from.panX),
    f: dpr * (to.panY - k * from.panY),
  };
}

/** True when `k` lies within [1 / max, max]. */
export function zoomRatioWithin(k: number, max: number): boolean {
  return k <= max && k >= 1 / max;
}

/**
 * Fraction of a `width` x `height` device view that the stored copy, drawn with `t`,
 * does not cover (0 when it covers everything, 1 when it is entirely off view).
 */
export function uncoveredFraction(
  t: CopyTransform,
  width: number,
  height: number,
): number {
  if (width <= 0 || height <= 0) return 0;
  const w = Math.max(0, Math.min(width, t.e + t.k * width) - Math.max(0, t.e));
  const h = Math.max(
    0,
    Math.min(height, t.f + t.k * height) - Math.max(0, t.f),
  );
  return 1 - (w * h) / (width * height);
}

export interface GestureBitmapEnv {
  readonly options: GestureBitmapOptions;
  /** Creates the offscreen canvas on the first capture (never at import). */
  readonly createCanvas: () => HTMLCanvasElement;
  readonly setTimer: (fn: () => void, ms: number) => number;
  readonly clearTimer: (handle: number) => void;
  /** Called when the settle timer fires: mark the scene dirty. */
  readonly settle: () => void;
}

export interface GestureBitmap {
  /** The viewport changed: the next scene frame may reuse the copy. */
  viewportChanged(): void;
  /** Any other scene change: the next scene frame must be exact. */
  invalidate(): void;
  /**
   * Draw the stored copy onto `target` transformed to `viewport`; false when the frame
   * must be painted exactly instead (nothing is drawn then).
   */
  reuse(target: HTMLCanvasElement, viewport: Viewport, dpr: number): boolean;
  /** Record an exact paint of `source` with `visible` painted nodes plus connections. */
  captured(
    source: HTMLCanvasElement,
    viewport: Viewport,
    dpr: number,
    visible: number,
  ): void;
  dispose(): void;
}

interface Stored {
  readonly viewport: Viewport;
  readonly dpr: number;
  readonly width: number;
  readonly height: number;
}

export function createGestureBitmap(env: GestureBitmapEnv): GestureBitmap {
  const minVisible =
    env.options.minVisible ?? DEFAULT_GESTURE_BITMAP.minVisible;
  const settleMs = env.options.settleMs ?? DEFAULT_GESTURE_BITMAP.settleMs;
  const maxZoomRatio =
    env.options.maxZoomRatio ?? DEFAULT_GESTURE_BITMAP.maxZoomRatio;
  const maxUncovered =
    env.options.maxUncovered ?? DEFAULT_GESTURE_BITMAP.maxUncovered;
  let copy: HTMLCanvasElement | undefined;
  let stored: Stored | undefined;
  let exactNeeded = true;
  let timer: number | undefined;
  let disposed = false;

  const stopTimer = (): void => {
    if (timer !== undefined) env.clearTimer(timer);
    timer = undefined;
  };

  return {
    viewportChanged() {
      if (disposed || !stored) return;
      stopTimer();
      timer = env.setTimer(() => {
        timer = undefined;
        exactNeeded = true;
        env.settle();
      }, settleMs);
    },
    invalidate() {
      exactNeeded = true;
    },
    reuse(target, viewport, dpr) {
      if (disposed || exactNeeded || !stored || !copy) return false;
      if (
        stored.dpr !== dpr ||
        stored.width !== target.width ||
        stored.height !== target.height
      )
        return false;
      // Staleness limit: a gesture that never rests still gets exact frames.
      const t = copyTransform(stored.viewport, viewport, dpr);
      if (!zoomRatioWithin(t.k, maxZoomRatio)) return false;
      if (uncoveredFraction(t, target.width, target.height) > maxUncovered)
        return false;
      const ctx = target.getContext("2d");
      if (!ctx) return false;
      const { k, e, f } = t;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, target.width, target.height);
      ctx.setTransform(k, 0, 0, k, e, f);
      ctx.drawImage(copy, 0, 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      return true;
    },
    captured(source, viewport, dpr, visible) {
      if (disposed) return;
      stopTimer();
      exactNeeded = false;
      if (visible < minVisible) {
        stored = undefined;
        return;
      }
      copy ??= env.createCanvas();
      if (copy.width !== source.width || copy.height !== source.height) {
        copy.width = source.width;
        copy.height = source.height;
      }
      const ctx = copy.getContext("2d");
      if (!ctx) {
        stored = undefined;
        return;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, copy.width, copy.height);
      ctx.drawImage(source, 0, 0);
      stored = {
        viewport,
        dpr,
        width: source.width,
        height: source.height,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stopTimer();
      stored = undefined;
      if (copy) {
        // Release the backing store now rather than at garbage collection.
        copy.width = 0;
        copy.height = 0;
      }
      copy = undefined;
    },
  };
}
