/**
 * Background layer: fill plus a world-aligned grid. The grid moves with pan and
 * zoom; minor lines fade out when they would be closer than a few pixels.
 */

import type { BackgroundPainter } from "../registries/painter-types.js";
import { setMatrix } from "./frame.js";

const MIN_LINE_GAP_PX = 6;

export const paintGrid: BackgroundPainter = (ctx, frame) => {
  const { theme, viewport, width, height, dpr } = frame;
  setMatrix(ctx, frame.viewportToDevice);
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, width, height);

  const step = theme.gridSpacing;
  if (!(step > 0) || !Number.isFinite(step)) return;
  const gapPx = step * viewport.zoom;
  const showMinor = gapPx >= MIN_LINE_GAP_PX;
  // Major lines every n steps; when minors are hidden, majors alone still show.
  const every = Math.max(1, Math.round(theme.gridMajorEvery));
  const stride = showMinor ? 1 : every;
  if (stride * gapPx < MIN_LINE_GAP_PX) return;

  const first = Math.floor(frame.visibleWorld.x / step / stride) * stride;
  const last = Math.ceil((frame.visibleWorld.x + frame.visibleWorld.w) / step);
  const firstY = Math.floor(frame.visibleWorld.y / step / stride) * stride;
  const lastY = Math.ceil((frame.visibleWorld.y + frame.visibleWorld.h) / step);

  ctx.lineWidth = 1 / dpr; // one device pixel
  for (const major of [false, true]) {
    ctx.strokeStyle = major ? theme.gridMajor : theme.gridMinor;
    ctx.beginPath();
    for (let i = first; i <= last; i += stride) {
      if ((i % every === 0) !== major) continue;
      const x =
        Math.round(i * step * viewport.zoom + viewport.panX) + 0.5 / dpr;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let j = firstY; j <= lastY; j += stride) {
      if ((j % every === 0) !== major) continue;
      const y =
        Math.round(j * step * viewport.zoom + viewport.panY) + 0.5 / dpr;
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();
  }
};
