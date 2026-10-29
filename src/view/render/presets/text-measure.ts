/**
 * Cached text measurement (design: text without core measurement). Widths are cached per
 * font and string in an instance-owned map, so repeated frames never re-measure. The
 * cache is cleared when it grows past a bound, which keeps memory limited without
 * tracking recency.
 */

const MAX_ENTRIES = 2000;

export interface TextMeasurer {
  width(ctx: CanvasRenderingContext2D, text: string): number;
  /** `text`, or a prefix with an ellipsis that fits `maxWidth` at the context's font. */
  fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string;
  /** Number of `measureText` calls made so far (for tests). */
  readonly measureCalls: number;
}

export function createTextMeasurer(): TextMeasurer {
  let cache = new Map<string, number>();
  let calls = 0;
  const measurer: TextMeasurer = {
    width(ctx, text) {
      const key = `${ctx.font}\u0000${text}`;
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      if (cache.size >= MAX_ENTRIES) cache = new Map();
      calls++;
      const w = ctx.measureText(text).width;
      cache.set(key, w);
      return w;
    },
    fit(ctx, text, maxWidth) {
      if (measurer.width(ctx, text) <= maxWidth) return text;
      let lo = 0;
      let hi = text.length;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (measurer.width(ctx, `${text.slice(0, mid)}…`) <= maxWidth) {
          lo = mid;
        } else hi = mid - 1;
      }
      return lo > 0 ? `${text.slice(0, lo)}…` : "…";
    },
    get measureCalls() {
      return calls;
    },
  };
  return measurer;
}
