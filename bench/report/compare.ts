/**
 * Comparison of a baseline with an earlier one: one row per result of the new
 * run, matched by runtime, workload, fixture, device pixel ratio and metric. Rows the
 * earlier run did not have show "-". Numbers are never pooled across DPRs.
 */
import type { Baseline, BenchResult } from "./types.js";

export interface PreviousBaseline {
  /** File name shown in the heading, e.g. `2026-10-30-chrome.json`. */
  readonly name: string;
  readonly baseline: Baseline;
}

const keyOf = (r: BenchResult): string =>
  [r.runtime, r.workload, r.fixture, r.dpr ?? "-", r.metric].join("|");

const fmt = (n: number): string => (n >= 100 ? n.toFixed(0) : n.toFixed(2));
const kib = (bytes: number): string => (bytes / 1024).toFixed(1);

/** Markdown section comparing `b` with `prev`; result order follows `b`. */
export function renderComparison(
  b: Baseline,
  prev: PreviousBaseline,
): string[] {
  const before = new Map(prev.baseline.results.map((r) => [keyOf(r), r]));
  const out: string[] = [
    `## Comparison with ${prev.name}`,
    "",
    `Earlier run: commit ${prev.baseline.commit}, ${prev.baseline.browser.name} ${prev.baseline.browser.version} (${prev.baseline.browser.headless ? "headless" : "headed"}).`,
    "",
    "| Runtime | Workload | Fixture | DPR | Metric | p95 before | p95 now | p99 before | p99 now | Status before | Status now |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const r of b.results) {
    const p = before.get(keyOf(r));
    out.push(
      `| ${r.runtime} | ${r.workload} | ${r.fixture} | ${r.dpr ?? "-"} | ${r.metric} | ${p ? fmt(p.p95) : "-"} | ${fmt(r.p95)} | ${p ? fmt(p.p99) : "-"} | ${fmt(r.p99)} | ${p?.status ?? "-"} | ${r.status} |`,
    );
  }
  const bundleBefore = new Map(prev.baseline.bundle.map((e) => [e.entry, e]));
  out.push(
    "",
    "| Bundle entry | KiB before | KiB now |",
    "| --- | --- | --- |",
  );
  for (const e of b.bundle) {
    const p = bundleBefore.get(e.entry);
    out.push(
      `| ${e.entry} | ${p ? kib(p.gzipBytes) : "-"} | ${kib(e.gzipBytes)} |`,
    );
  }
  return out;
}
