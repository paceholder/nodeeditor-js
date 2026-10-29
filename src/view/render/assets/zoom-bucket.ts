/**
 * Zoom buckets (AST-02). A bucket is a power-of-two multiple of the asset's intrinsic
 * size. Rasterizing only at bucket sizes means smooth zooming reuses a handful of
 * bitmaps instead of one per zoom step.
 */

export const MIN_BUCKET_EXP = -3; // 1/8
export const MAX_BUCKET_EXP = 4; // 16
export const MAX_RASTER_SIDE = 4096;

export interface PixelSize {
  readonly width: number;
  readonly height: number;
}

/**
 * Bucket exponent for an asset drawn `ratio` times its intrinsic size on the device
 * (`ratio = drawnDevicePixels / intrinsicPixels`): the smallest bucket at least as
 * sharp as needed, clamped, and lowered until the raster fits `MAX_RASTER_SIDE`.
 */
export function bucketExponent(ratio: number, intrinsic: PixelSize): number {
  if (!(ratio > 0) || !Number.isFinite(ratio)) return MIN_BUCKET_EXP;
  let exp = Math.ceil(Math.log2(ratio)) + 0; // + 0 turns -0 into 0
  exp = Math.min(MAX_BUCKET_EXP, Math.max(MIN_BUCKET_EXP, exp));
  const side = Math.max(intrinsic.width, intrinsic.height, 1);
  while (exp > MIN_BUCKET_EXP && side * 2 ** exp > MAX_RASTER_SIDE) exp--;
  return exp;
}

/** Raster size of a bucket; never below one pixel. */
export function rasterSize(intrinsic: PixelSize, exp: number): PixelSize {
  const s = 2 ** exp;
  return {
    width: Math.max(1, Math.round(intrinsic.width * s)),
    height: Math.max(1, Math.round(intrinsic.height * s)),
  };
}

/**
 * The ready bucket closest to `wanted`; ties go to the sharper one, because scaling
 * down looks better than scaling up. Undefined when none is ready.
 */
export function nearestBucket(
  ready: Iterable<number>,
  wanted: number,
): number | undefined {
  let best: number | undefined;
  for (const exp of ready) {
    if (best === undefined) {
      best = exp;
      continue;
    }
    const d = Math.abs(exp - wanted);
    const bd = Math.abs(best - wanted);
    if (d < bd || (d === bd && exp > best)) best = exp;
  }
  return best;
}
