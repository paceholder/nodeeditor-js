import { describe, expect, it } from "vitest";
import type { CachedBitmap } from "./asset-types.js";
import { createBitmapCache } from "./bitmap-cache.js";
import {
  bucketExponent,
  MAX_BUCKET_EXP,
  MAX_RASTER_SIDE,
  MIN_BUCKET_EXP,
  nearestBucket,
  rasterSize,
} from "./zoom-bucket.js";

function fake(w: number, h: number): CachedBitmap & { closed: boolean } {
  const b = {
    width: w,
    height: h,
    closed: false,
    close() {
      b.closed = true;
    },
  };
  return b;
}

describe("bitmap cache", () => {
  it("AST-03 cache limit reached: least recently drawn bitmaps are released first", () => {
    // 10x10x4 = 400 bytes each; budget holds two.
    const cache = createBitmapCache<ReturnType<typeof fake>>({
      budgetBytes: 800,
    });
    const a = fake(10, 10);
    const b = fake(10, 10);
    const c = fake(10, 10);
    cache.set("a", a);
    cache.set("b", b);
    cache.get("a"); // a is now more recent than b
    cache.set("c", c);
    expect(b.closed).toBe(true);
    expect(a.closed).toBe(false);
    expect(c.closed).toBe(false);
    expect(cache.has("b")).toBe(false);
    expect(cache.bytes()).toBe(800);
    expect(cache.size()).toBe(2);
  });

  it("AST-03 replacing a key closes the old bitmap; clear releases everything", () => {
    const cache = createBitmapCache<ReturnType<typeof fake>>({
      budgetBytes: 10_000,
    });
    const a1 = fake(5, 5);
    const a2 = fake(6, 6);
    cache.set("a", a1);
    cache.set("a", a2);
    expect(a1.closed).toBe(true);
    expect(cache.bytes()).toBe(6 * 6 * 4);
    cache.clear();
    expect(a2.closed).toBe(true);
    expect(cache.size()).toBe(0);
    expect(cache.bytes()).toBe(0);
  });

  it("AST-03 an oversized newest entry stays so it can be drawn, others go", () => {
    const cache = createBitmapCache<ReturnType<typeof fake>>({
      budgetBytes: 100,
    });
    const small = fake(2, 2);
    const big = fake(20, 20);
    cache.set("s", small);
    cache.set("big", big);
    expect(small.closed).toBe(true);
    expect(big.closed).toBe(false);
    expect(cache.has("big")).toBe(true);
  });
});

describe("bitmap cache reservations", () => {
  it("AST-03 reserved source bytes count against the budget and eviction is reported", () => {
    const evicted: string[] = [];
    const cache = createBitmapCache<ReturnType<typeof fake>>({
      budgetBytes: 1000,
      onEvict: (k) => evicted.push(k),
    });
    cache.reserve("a", 400);
    const first = fake(10, 10); // 400 bytes
    const second = fake(10, 10);
    cache.set("a:0", first);
    expect(evicted).toEqual([]);
    cache.set("a:1", second); // 400 + 400 + 400 > 1000: the oldest bitmap goes
    expect(evicted).toEqual(["a:0"]);
    expect(first.closed).toBe(true);
    expect(cache.reservedBytes()).toBe(400);
    cache.unreserve("a");
    expect(cache.reservedBytes()).toBe(0);
  });
});

describe("zoom buckets", () => {
  const icon = { width: 100, height: 50 };

  it("AST-02 nearby zooms share a bucket; buckets are powers of two", () => {
    expect(bucketExponent(1, icon)).toBe(0);
    expect(bucketExponent(0.9, icon)).toBe(0);
    expect(bucketExponent(1.01, icon)).toBe(1);
    expect(bucketExponent(2, icon)).toBe(1);
    expect(bucketExponent(0.5, icon)).toBe(-1);
    expect(bucketExponent(0.3, icon)).toBe(-1);
  });

  it("AST-02 exponent is clamped and raster size is bounded", () => {
    expect(bucketExponent(1e9, icon)).toBe(MAX_BUCKET_EXP);
    expect(bucketExponent(1e-9, icon)).toBe(MIN_BUCKET_EXP);
    expect(bucketExponent(Number.NaN, icon)).toBe(MIN_BUCKET_EXP);
    const huge = { width: 1000, height: 600 };
    const exp = bucketExponent(16, huge);
    expect(rasterSize(huge, exp).width).toBeLessThanOrEqual(MAX_RASTER_SIDE);
    expect(rasterSize({ width: 1, height: 1 }, -3)).toEqual({
      width: 1,
      height: 1,
    });
  });

  it("AST-02 nearest bucket prefers the sharper one on ties", () => {
    expect(nearestBucket([], 0)).toBeUndefined();
    expect(nearestBucket([-1, 2], 0)).toBe(-1);
    expect(nearestBucket([-1, 1], 0)).toBe(1);
    expect(nearestBucket([0, 3], 2)).toBe(3);
  });
});
