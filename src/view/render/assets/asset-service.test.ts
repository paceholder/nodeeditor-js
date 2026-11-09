/**
 * Asset service rules that need no real decoding: the decode step is replaced by fakes
 * whose bitmaps only know their size, so eviction and failure paths run in Node.
 */
import { describe, expect, it } from "vitest";
import { rect } from "../../../core/index.js";
import { type AssetServiceSeams, createAssetService } from "./asset-service.js";
import type { AssetOptions, AssetSource } from "./asset-types.js";
import type { DecodedAsset, DecodeResult } from "./decode.js";
import type { PixelSize } from "./zoom-bucket.js";

const ctx = {
  drawImage() {},
  imageSmoothingEnabled: false,
  imageSmoothingQuality: "low",
} as unknown as CanvasRenderingContext2D;

const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

interface FakeOptions {
  readonly side?: number;
  /** Rasterization of these sizes (longer side in pixels) fails. */
  readonly failSides?: readonly number[];
}

function fakes(opts: FakeOptions = {}) {
  const side = opts.side ?? 512;
  const log = { rasterized: [] as PixelSize[], released: 0 };
  const decode: AssetServiceSeams["decode"] = async (source: AssetSource) => {
    const decoded: DecodedAsset = {
      width: side,
      height: side,
      async rasterize(size) {
        if (opts.failSides?.includes(Math.max(size.width, size.height))) {
          throw new Error("raster failed");
        }
        log.rasterized.push(size);
        return { ...size, close() {} } as unknown as ImageBitmap;
      },
      release: () => void log.released++,
    };
    void source;
    return { ok: true, value: decoded } satisfies DecodeResult;
  };
  return { decode, log };
}

function service(options: AssetOptions, seams: AssetServiceSeams) {
  const s = createAssetService(options, seams);
  return s;
}

const SVG = { kind: "svg", text: "<svg/>" } as const;

describe("asset invalidation", () => {
  it("a failed rasterization leaves none of the asset's sizes in the cache", async () => {
    const f = fakes({ side: 100, failSides: [400] });
    const s = service({ resolve: async () => SVG }, { decode: f.decode });
    const d1 = s.drawer(ctx, 1);
    const box = rect<"local">(0, 0, 100, 100);
    d1.drawAsset("sym", box);
    await settle();
    expect(d1.drawAsset("sym", box)).toBe("pending");
    await settle();
    expect(d1.drawAsset("sym", box)).toBe("drawn");
    expect(s.stats().cacheEntries).toBe(1);
    // A sharper bucket (4x) fails to rasterize.
    s.drawer(ctx, 4).drawAsset("sym", box);
    await settle();
    expect(s.status("sym")).toBe("failed");
    expect(s.stats().cacheEntries).toBe(0);
    expect(s.stats().cacheBytes).toBe(0);
    s.dispose();
  });
});
