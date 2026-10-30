import { describe, expect, it } from "vitest";
import { percentile, summarize } from "./stats.js";

describe("PERF-01 nearest-rank percentiles", () => {
  it("single sample is every percentile", () => {
    expect(summarize([7])).toEqual({ p50: 7, p95: 7, p99: 7, samples: 1 });
  });

  it("even-length input takes the lower middle for p50", () => {
    // n = 4: rank ceil(0.5 * 4) = 2 -> second smallest.
    expect(percentile([1, 2, 3, 4], 50)).toBe(2);
  });

  it("matches hand-computed values for 1..100", () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(summarize(values)).toEqual({
      p50: 50,
      p95: 95,
      p99: 99,
      samples: 100,
    });
  });

  it("matches hand-computed values for 10 samples", () => {
    // ranks: p50 -> 5, p95 -> ceil(9.5) = 10, p99 -> 10
    const s = summarize([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    expect(s).toEqual({ p50: 5, p95: 10, p99: 10, samples: 10 });
  });

  it("sorts unsorted input without mutating it", () => {
    const input = [30, 10, 20];
    expect(summarize(input).p50).toBe(20);
    expect(input).toEqual([30, 10, 20]);
  });

  it("rejects empty input and bad percentiles", () => {
    expect(() => summarize([])).toThrow();
    expect(() => percentile([1], 0)).toThrow();
    expect(() => percentile([1], 101)).toThrow();
  });
});
