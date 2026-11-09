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
      bytes: side * side * 4,
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

  it("invalidating a ready asset asks the resolver again on the next draw", async () => {
    const f = fakes({ side: 100 });
    let calls = 0;
    const s = service(
      {
        resolve: async () => {
          calls++;
          return SVG;
        },
      },
      { decode: f.decode },
    );
    const changes: number[] = [];
    s.onChange(() => void changes.push(calls));
    const d = s.drawer(ctx, 1);
    const box = rect<"local">(0, 0, 100, 100);
    await drawUntilDrawn(d, "sym", box);
    await drawUntilDrawn(d, "other", box);
    expect(calls).toBe(2);
    changes.length = 0;
    s.invalidate("sym");
    expect(changes).toHaveLength(1);
    expect(s.status("sym")).toBe("unrequested");
    expect(s.status("other")).toBe("ready");
    await drawUntilDrawn(d, "sym", box);
    expect(calls).toBe(3);
    // Without a reference every asset is forgotten.
    s.invalidate();
    expect(s.status("sym")).toBe("unrequested");
    expect(s.status("other")).toBe("unrequested");
    expect(s.stats().cacheEntries).toBe(0);
    expect(s.stats().sourceBytes).toBe(0);
    s.dispose();
  });

  it("invalidating a failed asset clears its failure", async () => {
    let fail = true;
    const s = service(
      {
        resolve: async () => {
          if (fail) throw new Error("offline");
          return SVG;
        },
      },
      { decode: fakes().decode },
    );
    const d = s.drawer(ctx, 1);
    const box = rect<"local">(0, 0, 100, 100);
    d.drawAsset("sym", box);
    await settle();
    expect(s.status("sym")).toBe("failed");
    fail = false;
    s.invalidate("sym");
    expect(s.diagnostics()).toEqual([]);
    await drawUntilDrawn(d, "sym", box);
    s.dispose();
  });
});

describe("asset cache keeps the visible set", () => {
  it("eight visible 512x512 pictures under a 4 MiB budget resolve and rasterize once each", async () => {
    const f = fakes({ side: 512 });
    let resolves = 0;
    const s = service(
      {
        budgetBytes: 4 * 1024 * 1024,
        resolve: async () => {
          resolves++;
          return SVG;
        },
      },
      { decode: f.decode },
    );
    const box = rect<"local">(0, 0, 512, 512);
    const refs = Array.from({ length: 8 }, (_, i) => `sym${i}`);
    for (let frame = 0; frame < 120; frame++) {
      const d = s.drawer(ctx, 1);
      for (const ref of refs) d.drawAsset(ref, box);
      s.endFrame();
      await settle();
    }
    expect(resolves).toBe(8);
    expect(s.stats().rasterizations).toBe(8);
    expect(s.stats().resolves).toBe(8);
    // The frame needs 8 MiB of bitmaps: the cache stays over budget and says so.
    expect(s.stats().overBudget).toBe(true);
    expect(s.stats().pinnedBytes).toBeGreaterThanOrEqual(8 * 1024 * 1024);
    s.dispose();
  });

  it("an evicted bitmap is rasterized again from the kept source without a resolver call", async () => {
    const f = fakes({ side: 100 }); // 40 000 bytes per bitmap and per source
    let resolves = 0;
    const s = service(
      {
        budgetBytes: 200_000,
        resolve: async () => {
          resolves++;
          return SVG;
        },
      },
      { decode: f.decode },
    );
    const box = rect<"local">(0, 0, 100, 100);
    const frame = async (...refs: string[]): Promise<void> => {
      for (let i = 0; i < 4; i++) {
        const d = s.drawer(ctx, 1);
        for (const ref of refs) d.drawAsset(ref, box);
        s.endFrame();
        await settle();
      }
    };
    await frame("a", "b");
    await frame("c");
    // Sources of a, b, c plus three bitmaps exceed the budget: a's bitmap went first.
    expect(s.stats().cacheEntries).toBeLessThan(3);
    expect(s.status("a")).toBe("ready");
    await frame("a");
    expect(resolves).toBe(3);
    expect(s.stats().rasterizations).toBe(4);
    expect(s.stats().overBudget).toBe(false);
    s.dispose();
  });

  it("assets not drawn in the current frame are released whole when bitmaps alone cannot make room", async () => {
    const f = fakes({ side: 100 });
    let resolves = 0;
    const s = service(
      {
        budgetBytes: 100_000,
        resolve: async () => {
          resolves++;
          return SVG;
        },
      },
      { decode: f.decode },
    );
    const box = rect<"local">(0, 0, 100, 100);
    for (const ref of ["a", "b", "c"]) {
      for (let i = 0; i < 4; i++) {
        s.drawer(ctx, 1).drawAsset(ref, box);
        s.endFrame();
        await settle();
      }
    }
    // Only the asset drawn last stays; the earlier ones were forgotten.
    expect(s.status("c")).toBe("ready");
    expect(s.status("a")).toBe("unrequested");
    expect(resolves).toBe(3);
    expect(s.stats().overBudget).toBe(false);
    s.dispose();
  });
});

async function drawUntilDrawn(
  d: ReturnType<ReturnType<typeof createAssetService>["drawer"]>,
  ref: string,
  box: ReturnType<typeof rect<"local">>,
): Promise<void> {
  for (let i = 0; i < 20; i++) {
    if (d.drawAsset(ref, box) === "drawn") return;
    await settle();
  }
  throw new Error(`${ref} was never drawn`);
}
