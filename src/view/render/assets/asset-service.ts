/**
 * Asset service.
 *
 * Lifecycle per asset: unrequested -> resolving -> decoding -> ready | failed. The host
 * resolver supplies bytes; with no resolver nothing is fetched and the asset reads as
 * failed. Ready assets are rasterized per zoom bucket into a byte-budgeted LRU cache;
 * while a sharper bucket is prepared the nearest cached one is drawn scaled.
 *
 * Eviction keeps what the frames draw: bitmaps drawn or stored in the frame being painted
 * or the last painted one are pinned (results arrive between frames, and the next frame
 * draws the same set). An asset whose last bitmap is evicted keeps its decoded source,
 * so drawing it again rasterizes without asking the resolver. Only when bitmaps alone
 * cannot make room are whole assets released, those drawn in neither of those frames,
 * least recently drawn first. When the frame's own set exceeds the budget the cache stays
 * over it (`stats().overBudget`) instead of evicting what it is about to draw. Failures
 * are sticky: an asset is not retried until `retry(ref)` or a new resolver, which keeps
 * a broken asset from causing a request per frame. The service owns its state and
 * `dispose()` releases every decoded source and cached bitmap.
 */
import type { Rect } from "../../../core/index.js";
import type {
  AssetDiagnostic,
  AssetFailureCode,
  AssetOptions,
  AssetResolver,
  AssetService,
  AssetSource,
  AssetStatus,
  DrawResult,
} from "./asset-types.js";
import { createBitmapCache } from "./bitmap-cache.js";

export type { AssetService, AssetStats } from "./asset-types.js";

import { type DecodedAsset, type DecodeResult, decodeAsset } from "./decode.js";
import {
  bucketExponent,
  MAX_BUCKET_EXP,
  MIN_BUCKET_EXP,
  nearestBucket,
  rasterSize,
} from "./zoom-bucket.js";

/** Test seams: the decode step, so Node tests can use fake bitmaps. */
export interface AssetServiceSeams {
  readonly decode?: (
    source: AssetSource,
    maxSvgChars?: number,
  ) => Promise<DecodeResult>;
}

interface Entry {
  status: AssetStatus;
  decoded?: DecodedAsset;
  /** Bucket exponents being rendered now. */
  readonly rendering: Set<number>;
  /** The frame number of the last draw; entries drawn in the current frame are pinned. */
  drawnIn: number;
  /** Bytes the decoded source counts against the budget. */
  sourceBytes: number;
}

const MAX_DIAGNOSTICS = 200;
const keyOf = (ref: string, exp: number): string => `${ref}\u0000${exp}`;

export function createAssetService(
  options: AssetOptions = {},
  seams: AssetServiceSeams = {},
): AssetService {
  const decode = seams.decode ?? decodeAsset;
  let resolve = options.resolve;
  const cache = createBitmapCache<ImageBitmap>({
    ...(options.budgetBytes === undefined
      ? {}
      : { budgetBytes: options.budgetBytes }),
  });
  const entries = new Map<string, Entry>();
  const diagnostics = new Map<string, AssetDiagnostic>();
  const handlers = new Set<() => void>();
  const counts = { resolves: 0, rasterizations: 0 };
  let frame = 0;
  let over = false;
  let disposed = false;

  const notify = (): void => {
    for (const h of [...handlers]) h();
  };

  function fail(
    ref: string,
    entry: Entry,
    code: AssetFailureCode,
    message: string,
  ): void {
    entry.status = "failed";
    entry.decoded?.release();
    delete entry.decoded;
    cache.unreserve(ref);
    // No size of a failed asset stays cached (a rasterization of one size failed).
    dropBitmaps(ref);
    diagnostics.delete(ref);
    diagnostics.set(ref, { ref, code, message });
    if (diagnostics.size > MAX_DIAGNOSTICS) {
      const oldest = diagnostics.keys().next();
      if (!oldest.done) diagnostics.delete(oldest.value);
    }
    notify();
  }

  /**
   * Bring the cache within budget without touching the current frame's set: unpinned
   * bitmaps first, then whole ready assets drawn in neither this frame nor the last and
   * with nothing rendering, least recently drawn first. What remains over is pinned.
   */
  function trim(): void {
    cache.trim();
    if (cache.overBudget()) {
      const idle = [...entries]
        .filter(
          ([, e]) =>
            e.status === "ready" &&
            e.drawnIn < frame - 1 &&
            e.rendering.size === 0,
        )
        .sort(([, a], [, b]) => a.drawnIn - b.drawnIn);
      for (const [ref] of idle) {
        if (!cache.overBudget()) break;
        forget(ref);
      }
    }
    over = cache.overBudget();
  }

  /** Stale results (disposed service, retried or replaced entry) are dropped. */
  const current = (ref: string, entry: Entry): boolean =>
    !disposed && entries.get(ref) === entry;

  async function load(ref: string, entry: Entry): Promise<void> {
    let source: AssetSource;
    try {
      counts.resolves++;
      source = await (resolve as AssetResolver["resolve"])(ref);
    } catch (e) {
      if (current(ref, entry)) {
        fail(ref, entry, "resolve-failed", e instanceof Error ? e.message : "");
      }
      return;
    }
    if (!current(ref, entry)) return;
    entry.status = "decoding";
    const decoded = await decode(source, options.maxSvgChars);
    if (!current(ref, entry)) {
      if (decoded.ok) decoded.value.release();
      return;
    }
    if (!decoded.ok) {
      fail(ref, entry, decoded.code, decoded.message);
      return;
    }
    entry.decoded = decoded.value;
    entry.sourceBytes = decoded.value.bytes;
    cache.reserve(ref, entry.sourceBytes);
    entry.status = "ready";
    diagnostics.delete(ref);
    trim();
    notify();
  }

  function request(ref: string): Entry {
    const entry: Entry = {
      status: "resolving",
      rendering: new Set(),
      drawnIn: frame,
      sourceBytes: 0,
    };
    entries.set(ref, entry);
    if (!resolve) {
      fail(ref, entry, "no-resolver", "no asset resolver is configured");
    } else {
      void load(ref, entry);
    }
    return entry;
  }

  function render(ref: string, entry: Entry, exp: number): void {
    const decoded = entry.decoded;
    if (!decoded || entry.rendering.has(exp)) return;
    entry.rendering.add(exp);
    counts.rasterizations++;
    decoded
      .rasterize(rasterSize(decoded, exp))
      .then((bitmap) => {
        entry.rendering.delete(exp);
        if (!current(ref, entry)) return bitmap.close();
        // Stored for the frame that asked for it: pinned like a drawn bitmap.
        cache.set(keyOf(ref, exp), bitmap);
        cache.pin(keyOf(ref, exp));
        trim();
        notify();
      })
      .catch(() => {
        entry.rendering.delete(exp);
        if (current(ref, entry)) {
          fail(ref, entry, "decode-failed", "rasterization failed");
        }
      });
  }

  function draw(
    ctx: CanvasRenderingContext2D,
    ref: string,
    rect: Rect<"local">,
    scale: number,
  ): DrawResult {
    if (disposed) return "failed";
    const entry = entries.get(ref) ?? request(ref);
    entry.drawnIn = frame;
    if (entry.status === "failed") return "failed";
    const decoded = entry.decoded;
    if (entry.status !== "ready" || !decoded) return "pending";
    const wanted = bucketExponent((rect.w * scale) / decoded.width, decoded);
    let key = keyOf(ref, wanted);
    let bitmap = cache.get(key);
    if (!bitmap) {
      render(ref, entry, wanted);
      const ready: number[] = [];
      for (let e = MIN_BUCKET_EXP; e <= MAX_BUCKET_EXP; e++) {
        if (cache.has(keyOf(ref, e))) ready.push(e);
      }
      const near = nearestBucket(ready, wanted);
      if (near === undefined) return "pending";
      key = keyOf(ref, near);
      bitmap = cache.get(key);
    }
    if (!bitmap) return "pending";
    cache.pin(key);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, rect.x, rect.y, rect.w, rect.h);
    return "drawn";
  }

  function dropBitmaps(ref: string): void {
    for (let e = MIN_BUCKET_EXP; e <= MAX_BUCKET_EXP; e++) {
      cache.delete(keyOf(ref, e));
    }
  }

  function forget(ref: string): void {
    const entry = entries.get(ref);
    if (!entry) return;
    entries.delete(ref);
    entry.decoded?.release();
    cache.unreserve(ref);
    diagnostics.delete(ref);
    dropBitmaps(ref);
  }

  return {
    drawer: (ctx, scale) => ({
      drawAsset: (ref, rect) => draw(ctx, ref, rect, scale),
    }),
    status: (ref) => entries.get(ref)?.status ?? "unrequested",
    diagnostics: () => [...diagnostics.values()],
    retry(ref) {
      if (disposed || entries.get(ref)?.status !== "failed") return;
      forget(ref);
      notify();
    },
    invalidate(ref) {
      if (disposed) return;
      if (ref === undefined) {
        for (const known of [...entries.keys()]) forget(known);
      } else {
        if (!entries.has(ref)) return;
        forget(ref);
      }
      notify();
    },
    setResolver(next) {
      resolve = next;
      for (const [ref, entry] of [...entries]) {
        if (entry.status === "failed") forget(ref);
      }
      notify();
    },
    endFrame() {
      frame++;
      cache.endFrame();
    },
    onChange(handler) {
      // A wrapper per subscription, so subscribing one function twice unsubscribes once.
      const entry = (): void => handler();
      handlers.add(entry);
      return () => void handlers.delete(entry);
    },
    stats: () => ({
      ...counts,
      cacheBytes: cache.bytes(),
      cacheEntries: cache.size(),
      sourceBytes: cache.reservedBytes(),
      pinnedBytes:
        cache.pinnedBytes() +
        [...entries.values()]
          .filter((e) => e.drawnIn >= frame - 1 && e.decoded)
          .reduce((sum, e) => sum + e.sourceBytes, 0),
      overBudget: over,
    }),
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const [ref, entry] of entries) {
        entry.decoded?.release();
        cache.unreserve(ref);
      }
      entries.clear();
      diagnostics.clear();
      handlers.clear();
      cache.clear();
    },
  };
}
