/**
 * Asset contracts (AST-01..04). Painters reference assets by ID and never load images
 * themselves; the host resolver supplies the bytes. URLs are deliberately not a source
 * kind, so the library never fetches anything on its own (AST-01, PKG-02).
 */
import type { Rect } from "../../../core/index.js";

export type AssetSource =
  | { readonly kind: "svg"; readonly text: string }
  | { readonly kind: "blob"; readonly blob: Blob };

/** Host-supplied loader. A rejection marks the asset failed (AST-04). */
export interface AssetResolver {
  resolve(ref: string): Promise<AssetSource>;
}

export interface AssetOptions {
  /** Without a resolver nothing is loaded and every asset reads as failed. */
  readonly resolve?: AssetResolver["resolve"];
  /** Bitmap cache budget in bytes (w*h*4 per bitmap); default 64 MiB. */
  readonly budgetBytes?: number;
  /** Largest SVG text accepted, in UTF-16 units; default 1 MiB (SAFE-03). */
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
