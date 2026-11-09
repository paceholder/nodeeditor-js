/**
 * Decoding and rasterizing. Browser-only; called after mount.
 *
 * SVG text is screened, then decoded once through an image element on a Blob URL; each
 * bucket is rendered by drawing that image to a canvas at the bucket size, so vector
 * art stays sharp rather than being resized from a small raster. Raster blobs decode
 * once to a bitmap and are scaled per bucket the same way.
 */
import type { AssetFailureCode, AssetSource } from "./asset-types.js";
import { screenSvg } from "./svg-safety.js";
import type { PixelSize } from "./zoom-bucket.js";

export interface DecodedAsset {
  readonly width: number;
  readonly height: number;
  /**
   * Bytes the source counts against the asset budget: an SVG its markup (two bytes per
   * character; the decoded image element is the browser's), a raster its pixels.
   */
  readonly bytes: number;
  /** Render at the given pixel size into a fresh bitmap. */
  rasterize(size: PixelSize): Promise<ImageBitmap>;
  /** Release the decoded source (revokes the Blob URL, closes the bitmap). */
  release(): void;
}

export type DecodeResult =
  | { readonly ok: true; readonly value: DecodedAsset }
  | {
      readonly ok: false;
      readonly code: AssetFailureCode;
      readonly message: string;
    };

const fail = (code: AssetFailureCode, message: string): DecodeResult => ({
  ok: false,
  code,
  message,
});

async function render(
  source: CanvasImageSource,
  size: PixelSize,
): Promise<ImageBitmap> {
  const canvas =
    typeof OffscreenCanvas === "function"
      ? new OffscreenCanvas(size.width, size.height)
      : Object.assign(document.createElement("canvas"), size);
  const ctx = canvas.getContext("2d") as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) throw new Error("no 2d context for rasterization");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, size.width, size.height);
  return createImageBitmap(canvas);
}

async function decodeSvg(
  text: string,
  maxChars: number | undefined,
): Promise<DecodeResult> {
  const screened = screenSvg(text, maxChars);
  if (!screened.ok) return fail("unsafe", screened.error.reason);
  const { width, height } = screened.value;
  const url = URL.createObjectURL(
    new Blob([screened.value.text], { type: "image/svg+xml" }),
  );
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch {
    URL.revokeObjectURL(url);
    return fail("decode-failed", "SVG could not be decoded");
  }
  return {
    ok: true,
    value: {
      width,
      height,
      bytes: screened.value.text.length * 2,
      rasterize: (size) => render(img, size),
      release: () => URL.revokeObjectURL(url),
    },
  };
}

async function decodeRaster(blob: Blob): Promise<DecodeResult> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    return fail("decode-failed", "image could not be decoded");
  }
  return {
    ok: true,
    value: {
      width: bitmap.width,
      height: bitmap.height,
      bytes: bitmap.width * bitmap.height * 4,
      rasterize: (size) => render(bitmap, size),
      release: () => bitmap.close(),
    },
  };
}

export async function decodeAsset(
  source: AssetSource,
  maxSvgChars?: number,
): Promise<DecodeResult> {
  switch (source.kind) {
    case "svg":
      return decodeSvg(source.text, maxSvgChars);
    case "blob":
      // An SVG blob must pass the same screening as SVG text.
      if (source.blob.type === "image/svg+xml") {
        return decodeSvg(await source.blob.text(), maxSvgChars);
      }
      return decodeRaster(source.blob);
  }
}
