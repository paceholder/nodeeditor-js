/**
 * Per-frame values shared by every layer painter: backing size, viewport, theme, the
 * composed matrices, and the visible world rectangle used for culling. Built once per
 * painted layer; painters never recompute the transform chain.
 */
import {
  type Affine2,
  affine,
  compose,
  type Rect,
  rect,
  type Viewport,
  viewportMatrix,
  viewportToWorld,
} from "../../../core/index.js";
import type { ThemeTokens } from "../theme/tokens.js";

export interface PaintFrame {
  /** CSS size of the container. */
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
  readonly viewport: Viewport;
  readonly theme: ThemeTokens;
  readonly viewportToDevice: Affine2<"viewport", "device">;
  readonly worldToDevice: Affine2<"world", "device">;
  readonly visibleWorld: Rect<"world">;
}

export function createPaintFrame(
  size: { width: number; height: number; dpr: number },
  viewport: Viewport,
  theme: ThemeTokens,
): PaintFrame {
  const toDevice = affine<"viewport", "device">(size.dpr, 0, 0, size.dpr, 0, 0);
  const a = viewportToWorld(viewport, { x: 0, y: 0 });
  const b = viewportToWorld(viewport, { x: size.width, y: size.height });
  return {
    ...size,
    viewport,
    theme,
    viewportToDevice: toDevice,
    worldToDevice: compose(toDevice, viewportMatrix(viewport)),
    visibleWorld: rect(a.x, a.y, b.x - a.x, b.y - a.y),
  };
}

export function setMatrix(ctx: CanvasRenderingContext2D, m: Affine2): void {
  ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
}
