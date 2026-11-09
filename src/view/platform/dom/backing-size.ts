/**
 * Backing-store size of the view's canvases. The exact device-pixel box is used where the
 * browser reports it (`devicePixelContentBoxSize`), because rounding CSS size times the
 * ratio can land one pixel off the box the browser snapped to, which blurs every line at
 * fractional ratios. The area of each canvas is capped: iOS Safari silently shows a blank
 * canvas past 16 777 216 pixels. Above the cap the effective ratio is lowered so painting
 * still fills the canvas.
 */

/** Largest backing area of one canvas, in device pixels (4096 x 4096). */
export const MAX_BACKING_AREA = 16_777_216;

export interface BackingSize {
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  /** Device pixels per CSS pixel painting must use: the ratio, lowered by the cap. */
  readonly dpr: number;
}

export function backingSize(
  css: { readonly width: number; readonly height: number },
  dpr: number,
  device?: { readonly width: number; readonly height: number },
  maxArea: number = MAX_BACKING_AREA,
): BackingSize {
  // A box measured before a ratio change (more than a pixel off) is not used.
  const box =
    device &&
    Math.abs(device.width - css.width * dpr) < 2 &&
    Math.abs(device.height - css.height * dpr) < 2
      ? device
      : undefined;
  let w = Math.max(1, box ? box.width : Math.round(css.width * dpr));
  let h = Math.max(1, box ? box.height : Math.round(css.height * dpr));
  let ratio = dpr;
  if (w * h > maxArea) {
    const s = Math.sqrt(maxArea / (w * h));
    // The epsilon keeps an exact fit (4095.9999999) from flooring one pixel short.
    w = Math.max(1, Math.floor(w * s + 1e-9));
    h = Math.max(1, Math.floor(h * s + 1e-9));
    ratio = dpr * s;
  }
  return { pixelWidth: w, pixelHeight: h, dpr: ratio };
}
