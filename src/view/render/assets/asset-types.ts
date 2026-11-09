/**
 * Asset contracts. Painters reference assets by ID and never load images
 * themselves; the host resolver supplies the bytes. URLs are deliberately not a source
 * kind, so the library never fetches anything on its own.
 */
import type { Rect } from "../../../core/index.js";

export type AssetSource =
  | { readonly kind: "svg"; readonly text: string }
  | { readonly kind: "blob"; readonly blob: Blob };

/** Host-supplied loader. A rejection marks the asset failed. */
export interface AssetResolver {
  resolve(ref: string): Promise<AssetSource>;
}

export interface AssetOptions {
  /** Without a resolver nothing is loaded and every asset reads as failed. */
  readonly resolve?: AssetResolver["resolve"];
  /** Bitmap cache budget in bytes (w*h*4 per bitmap); default 64 MiB. */
  readonly budgetBytes?: number;
  /** Largest SVG text accepted, in UTF-16 units; default 1 MiB. */
  readonly maxSvgChars?: number;
}

export type AssetStatus =
  | "unrequested"
  | "resolving"
  | "decoding"
  | "ready"
  | "failed";

export type AssetFailureCode =
  | "no-resolver"
  | "resolve-failed"
  | "unsafe"
  | "decode-failed";

export interface AssetDiagnostic {
  readonly ref: string;
  readonly code: AssetFailureCode;
  readonly message: string;
}

export type DrawResult = "drawn" | "pending" | "failed";

/** What a painter sees. Draws into the context the painter is already painting on. */
export interface AssetDrawer {
  /**
   * Draw the asset to fill `rect` (in the current context space). `pending` means a
   * request is in flight and nothing (or only a lower-resolution bucket) was drawn;
   * `failed` means a placeholder should be drawn instead.
   */
  drawAsset(ref: string, rect: Rect<"local">): DrawResult;
}

/** A bitmap the cache can own: it knows its size and releases its memory. */
export interface CachedBitmap {
  readonly width: number;
  readonly height: number;
  close(): void;
}

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
  /** Bytes the current frame needs: its pinned bitmaps and the sources of assets it drew. */
  readonly pinnedBytes: number;
  /**
   * True while the frame's own bitmaps and sources exceed the budget, so the cache holds
   * more than the budget rather than evict what is visible. Raise `budgetBytes` if it stays.
   */
  readonly overBudget: boolean;
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
  /**
   * A frame was painted: what it drew stops being pinned. The view calls it after every
   * frame; a standalone user must too, or every bitmap ever drawn stays pinned.
   */
  endFrame(): void;
  /** Called when an asset becomes ready or fails; returns an unsubscribe function. */
  onChange(handler: () => void): () => void;
  stats(): AssetStats;
  dispose(): void;
}
