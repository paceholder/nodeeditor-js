/** Nearest-rank percentiles and sample summaries. */

export interface Summary {
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly samples: number;
}

/**
 * Nearest-rank percentile of an ascending list: the value at rank ceil(p/100 * n), counted
 * from 1. No interpolation, so every reported value is an observed sample.
 */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) throw new Error("percentile of an empty sample");
  if (!(p > 0 && p <= 100)) throw new Error(`percentile out of range: ${p}`);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1] as number;
}

export function summarize(values: readonly number[]): Summary {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    samples: sorted.length,
  };
}
