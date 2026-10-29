/// <reference types="@vitest/browser-playwright" />
import { afterEach, describe, expect, it, vi } from "vitest";
import { rect } from "../../../core/index.js";
import { solidSvg, until } from "../../browser-support.js";
import { type AssetService, createAssetService } from "./asset-service.js";
import type { AssetOptions } from "./asset-types.js";

const services: AssetService[] = [];
function service(options?: AssetOptions): AssetService {
  const s = createAssetService(options);
  services.push(s);
  return s;
}
afterEach(() => {
  for (const s of services.splice(0)) s.dispose();
  vi.restoreAllMocks();
});

function canvas(w = 100, h = 100) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d") as CanvasRenderingContext2D;
  return { c, ctx };
}
const BOX = rect<"local">(0, 0, 40, 20);
const red = { kind: "svg", text: solidSvg(40, 20, "#ff0000") } as const;

describe("asset service", () => {
  it("AST-01 no resolver configured: nothing is fetched, a placeholder is requested", async () => {
    const fetchSpy = vi.spyOn(window, "fetch");
    const before = performance.getEntriesByType("resource").length;
    const s = service();
    const { ctx } = canvas();
    const d = s.drawer(ctx, 1);
    expect(d.drawAsset("pump-symbol", BOX)).toBe("failed");
    expect(d.drawAsset("pump-symbol", BOX)).toBe("failed");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(performance.getEntriesByType("resource").length).toBe(before);
    expect(s.diagnostics().map((x) => x.code)).toEqual(["no-resolver"]);
    expect(s.status("pump-symbol")).toBe("failed");
  });

  it("AST-01 painter draws an asset obtained through the host resolver", async () => {
    const resolve = vi.fn(async () => red);
    const s = service({ resolve });
    const { ctx } = canvas();
    const d = s.drawer(ctx, 1);
    expect(d.drawAsset("pump-symbol", BOX)).toBe("pending");
    await until(() => s.status("pump-symbol") === "ready");
    await until(() => d.drawAsset("pump-symbol", BOX) === "drawn");
    expect(resolve).toHaveBeenCalledWith("pump-symbol");
    const px = ctx.getImageData(20, 10, 1, 1).data;
    expect([px[0], px[1], px[2], px[3]]).toEqual([255, 0, 0, 255]);
  });

  it("AST-02 repeated frames reuse bitmaps: one resolve and one rasterization", async () => {
    const resolve = vi.fn(async () => red);
    const s = service({ resolve });
    const { ctx } = canvas();
    const d = s.drawer(ctx, 1);
    await until(() => d.drawAsset("sym", BOX) === "drawn");
    for (let frame = 0; frame < 20; frame++) {
      for (let i = 0; i < 25; i++) d.drawAsset("sym", BOX); // 500 draws
      await new Promise((r) => requestAnimationFrame(r));
    }
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(s.stats().rasterizations).toBe(1);
    expect(s.stats().cacheEntries).toBe(1);
  });

  it("AST-02 zoom crosses a bucket: old bitmap drawn scaled, then a sharper one, then repaint", async () => {
    const s = service({ resolve: async () => red });
    const changes = vi.fn();
    s.onChange(changes);
    const { ctx } = canvas();
    await until(() => s.drawer(ctx, 1).drawAsset("sym", BOX) === "drawn");
    expect(s.stats().rasterizations).toBe(1);
    changes.mockClear();

    const sharp = s.drawer(ctx, 4); // device px per unit 4 => bucket 2
    expect(sharp.drawAsset("sym", BOX)).toBe("drawn"); // nearest bucket, no gap
    await until(
      () => s.stats().rasterizations === 2 && changes.mock.calls.length > 0,
    );
    expect(s.stats().cacheEntries).toBe(2);
    // Same bucket again: no further rasterization.
    sharp.drawAsset("sym", BOX);
    await new Promise((r) => requestAnimationFrame(r));
    expect(s.stats().rasterizations).toBe(2);
  });

  it("AST-02 raster images (PNG) work too", async () => {
    const src = canvas(8, 4);
    src.ctx.fillStyle = "#00ff00";
    src.ctx.fillRect(0, 0, 8, 4);
    const blob = await new Promise<Blob>((r) =>
      src.c.toBlob((b) => r(b as Blob), "image/png"),
    );
    const s = service({ resolve: async () => ({ kind: "blob", blob }) });
    const { ctx } = canvas();
    const d = s.drawer(ctx, 1);
    await until(() => d.drawAsset("png", BOX) === "drawn");
    const px = ctx.getImageData(20, 10, 1, 1).data;
    expect([px[0], px[1], px[2], px[3]]).toEqual([0, 255, 0, 255]);
  });

  it("AST-03 budget bounds the cache and dispose releases everything", async () => {
    // Budget fits one 40x20 bitmap (3200 bytes) but not two buckets of it.
    const s = service({ resolve: async () => red, budgetBytes: 4000 });
    const { ctx } = canvas();
    await until(() => s.drawer(ctx, 1).drawAsset("sym", BOX) === "drawn");
    s.drawer(ctx, 2).drawAsset("sym", BOX);
    await until(() => s.stats().rasterizations === 2);
    await until(() => s.stats().cacheEntries === 1);
    expect(s.stats().cacheBytes).toBeLessThanOrEqual(80 * 40 * 4);
    expect(s.stats().sourceBytes).toBe(40 * 20 * 4);
    s.dispose();
    expect(s.stats().cacheEntries).toBe(0);
    expect(s.stats().cacheBytes).toBe(0);
    expect(s.drawer(ctx, 1).drawAsset("sym", BOX)).toBe("failed");
  });

  it("AST-03 decoded sources count against the budget and are released with their last bucket", async () => {
    // Each asset costs 3200 (source) + 3200 (bucket); the budget holds one and a bit.
    const s = service({ resolve: async () => red, budgetBytes: 9000 });
    const { ctx } = canvas();
    await until(() => s.drawer(ctx, 1).drawAsset("a", BOX) === "drawn");
    expect(s.stats().sourceBytes).toBe(3200);
    await until(() => s.drawer(ctx, 1).drawAsset("b", BOX) === "drawn");
    // "a" lost its only bucket, so its decoded source went with it.
    expect(s.status("a")).toBe("unrequested");
    expect(s.status("b")).toBe("ready");
    expect(s.stats().sourceBytes).toBe(3200);
    expect(s.stats().cacheEntries).toBe(1);
  });

  it("AST-04 asset load fails: failed once, not retried per frame, retry is explicit", async () => {
    const resolve = vi.fn(async () => {
      throw new Error("404");
    });
    const s = service({ resolve });
    const { ctx } = canvas();
    const d = s.drawer(ctx, 1);
    d.drawAsset("gone", BOX);
    await until(() => s.status("gone") === "failed");
    for (let i = 0; i < 50; i++)
      expect(d.drawAsset("gone", BOX)).toBe("failed");
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(s.diagnostics()).toEqual([
      { ref: "gone", code: "resolve-failed", message: "404" },
    ]);
    s.retry("gone");
    d.drawAsset("gone", BOX);
    await until(() => resolve.mock.calls.length === 2);
  });

  it("AST-04 replacing the resolver makes failed assets eligible again", async () => {
    const s = service({ resolve: async () => Promise.reject(new Error("x")) });
    const { ctx } = canvas();
    const d = s.drawer(ctx, 1);
    d.drawAsset("a", BOX);
    await until(() => s.status("a") === "failed");
    s.setResolver(async () => red);
    await until(() => d.drawAsset("a", BOX) === "drawn");
    expect(s.diagnostics()).toEqual([]);
  });

  it("AST-04 active SVG content is rejected: failed with an unsafe diagnostic", async () => {
    const evil = `<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><script>alert(1)</script></svg>`;
    const s = service({ resolve: async () => ({ kind: "svg", text: evil }) });
    const { ctx } = canvas();
    const d = s.drawer(ctx, 1);
    d.drawAsset("evil", BOX);
    await until(() => s.status("evil") === "failed");
    expect(s.diagnostics()[0]?.code).toBe("unsafe");
    expect(d.drawAsset("evil", BOX)).toBe("failed");
  });
});
