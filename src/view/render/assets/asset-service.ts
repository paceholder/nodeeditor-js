/**
 * Asset service.
 *
 * Lifecycle per asset: unrequested -> resolving -> decoding -> ready | failed. The host
 * resolver supplies bytes; with no resolver nothing is fetched and the asset reads as
 * failed. Ready assets are rasterized per zoom bucket into a byte-budgeted LRU cache;
 * while a sharper bucket is prepared the nearest cached one is drawn scaled. Failures
 * are sticky: an asset is not retried until `retry(ref)` or a new resolver, which keeps
 * a broken asset from causing a request per frame. The service owns its state and
 * `dispose()` releases every decoded source and cached bitmap.
 */
import type { Rect } from "../../../core/index.js";
import type {
  AssetDiagnostic,
  AssetDrawer,
  AssetFailureCode,
  AssetOptions,
  AssetResolver,
  AssetSource,
  AssetStatus,
  DrawResult,
} from "./asset-types.js";
import { createBitmapCache } from "./bitmap-cache.js";
import { type DecodedAsset, type DecodeResult, decodeAsset } from "./decode.js";
import {
  bucketExponent,
  MAX_BUCKET_EXP,
  MIN_BUCKET_EXP,
  nearestBucket,
  rasterSize,
} from "./zoom-bucket.js";

export interface AssetStats {
  /** Resolver calls made. */
  readonly resolves: number;
  /** Bitmaps rendered (one per asset and bucket, plus re-renders after eviction). */
  readonly rasterizations: number;
  /** Bytes of cached bitmaps. */
  readonly cacheBytes: number;
  readonly cacheEntries: number;
  /** Estimated bytes of decoded sources (width * height * 4); counted in the budget. */
  readonly sourceBytes: number;
}

export interface AssetService {
  /** A drawer bound to a context; `scale` is device pixels per context unit. */
  drawer(ctx: CanvasRenderingContext2D, scale: number): AssetDrawer;
  status(ref: string): AssetStatus;
  diagnostics(): readonly AssetDiagnostic[];
  /** Forget a failure and load the asset again. */
  retry(ref: string): void;
  /**
   * Forget one asset, or every asset without a reference: cached bitmaps, decoded sources
   * and failures are released, and the next draw asks the resolver again. For a host whose
   * resolver now returns something else for a reference (a swapped symbol library).
   */
  invalidate(ref?: string): void;
  /** Replace the resolver; failed assets become eligible again. */
  setResolver(resolve: AssetResolver["resolve"] | undefined): void;
  /** Called when an asset becomes ready or fails; returns an unsubscribe function. */
  onChange(handler: () => void): () => void;
  stats(): AssetStats;
  dispose(): void;
}

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
    onEvict: (key) => releaseIfBare(key.slice(0, key.indexOf("\u0000"))),
  });
  const entries = new Map<string, Entry>();
  const diagnostics = new Map<string, AssetDiagnostic>();
  const handlers = new Set<() => void>();
  const counts = { resolves: 0, rasterizations: 0 };
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
   * A decoded source is only worth keeping while it has cached buckets (or one being
   * rendered). Past that it is released and the asset reads as unrequested again.
   */
  function releaseIfBare(ref: string): void {
    const entry = entries.get(ref);
    if (!entry?.decoded || entry.rendering.size > 0) return;
    for (let e = MIN_BUCKET_EXP; e <= MAX_BUCKET_EXP; e++) {
      if (cache.has(keyOf(ref, e))) return;
    }
    entry.decoded.release();
    cache.unreserve(ref);
    entries.delete(ref);
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
    cache.reserve(ref, decoded.value.width * decoded.value.height * 4);
    entry.status = "ready";
    diagnostics.delete(ref);
    notify();
  }

  function request(ref: string): Entry {
    const entry: Entry = { status: "resolving", rendering: new Set() };
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
        cache.set(keyOf(ref, exp), bitmap);
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
    if (entry.status === "failed") return "failed";
    const decoded = entry.decoded;
    if (entry.status !== "ready" || !decoded) return "pending";
    const wanted = bucketExponent((rect.w * scale) / decoded.width, decoded);
    let bitmap = cache.get(keyOf(ref, wanted));
    if (!bitmap) {
      render(ref, entry, wanted);
      const ready: number[] = [];
      for (let e = MIN_BUCKET_EXP; e <= MAX_BUCKET_EXP; e++) {
        if (cache.has(keyOf(ref, e))) ready.push(e);
      }
      const near = nearestBucket(ready, wanted);
      bitmap = near === undefined ? undefined : cache.get(keyOf(ref, near));
    }
    if (!bitmap) return "pending";
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
    onChange(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    stats: () => ({
      ...counts,
      cacheBytes: cache.bytes(),
      cacheEntries: cache.size(),
      sourceBytes: cache.reservedBytes(),
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
