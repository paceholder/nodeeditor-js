/**
 * Background layer: fill plus a world-aligned grid. The grid moves with pan and
 * zoom and keeps a steady on-screen density: when zooming out makes the lines too close,
 * the grid steps up by `gridMajorEvery` (20 → 100 → 500 world units …), and the minor
 * lines of each level fade in as they open up, so the switch has no visible jump.
 */

import type { BackgroundPainter } from "../registries/painter-types.js";
import { setMatrix } from "./frame.js";

/** Closest allowed gap between drawn lines, in CSS pixels. */
const MIN_LINE_GAP_PX = 8;
/** Bound on level climbing, for absurd zooms or a step of 1 with `every` of 1. */
const MAX_LEVELS = 12;

export interface GridLevel {
  /** World units between minor lines at this zoom. */
  readonly minorStep: number;
  /** Every n-th minor line is a major line (the theme's `gridMajorEvery`). */
  readonly majorEvery: number;
  /** Opacity of minor lines, 0..1: 0 at the minimum gap, 1 from twice that. */
  readonly minorAlpha: number;
}

/**
 * The grid level for a zoom: the smallest `step * every^k` whose on-screen gap is at
 * least the minimum (`every` below 2 steps by 2). Returns `undefined` when the grid
 * cannot be drawn.
 */
export function gridLevel(
  step: number,
  every: number,
  zoom: number,
): GridLevel | undefined {
  if (!(step > 0) || !Number.isFinite(step) || !(zoom > 0)) return undefined;
  const majorEvery = Math.max(1, Math.round(every));
  const n = Math.max(2, majorEvery);
  let minorStep = step;
  for (let k = 0; minorStep * zoom < MIN_LINE_GAP_PX; k++) {
    if (k >= MAX_LEVELS) return undefined;
    minorStep *= n;
  }
  const gapPx = minorStep * zoom;
  const minorAlpha = Math.min(1, (gapPx - MIN_LINE_GAP_PX) / MIN_LINE_GAP_PX);
  return { minorStep, majorEvery, minorAlpha };
}

/**
 * A line coordinate in CSS pixels whose device coordinate is the centre of a device pixel,
 * so a one-device-pixel line stays crisp at fractional ratios (1.25, 1.5).
 */
function onDevicePixel(css: number, dpr: number): number {
  return (Math.round(css * dpr - 0.5) + 0.5) / dpr;
}

export const paintGrid: BackgroundPainter = (ctx, frame) => {
  const { theme, viewport, width, height, dpr } = frame;
  setMatrix(ctx, frame.viewportToDevice);
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, width, height);

  const level = gridLevel(
    theme.gridSpacing,
    theme.gridMajorEvery,
    viewport.zoom,
  );
  if (!level) return;
  const { minorStep, majorEvery: every, minorAlpha } = level;
  const first = Math.floor(frame.visibleWorld.x / minorStep);
  const last = Math.ceil(
    (frame.visibleWorld.x + frame.visibleWorld.w) / minorStep,
  );
  const firstY = Math.floor(frame.visibleWorld.y / minorStep);
  const lastY = Math.ceil(
    (frame.visibleWorld.y + frame.visibleWorld.h) / minorStep,
  );

  ctx.lineWidth = 1 / dpr; // one device pixel
  for (const major of [false, true]) {
    if (!major && minorAlpha <= 0) continue;
    ctx.globalAlpha = major ? 1 : minorAlpha;
    ctx.strokeStyle = major ? theme.gridMajor : theme.gridMinor;
    ctx.beginPath();
    for (let i = first; i <= last; i++) {
      if ((i % every === 0) !== major) continue;
      const x = onDevicePixel(
        i * minorStep * viewport.zoom + viewport.panX,
        dpr,
      );
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let j = firstY; j <= lastY; j++) {
      if ((j % every === 0) !== major) continue;
      const y = onDevicePixel(
        j * minorStep * viewport.zoom + viewport.panY,
        dpr,
      );
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
};
