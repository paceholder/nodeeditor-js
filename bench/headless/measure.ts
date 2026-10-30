/**
 * Runs vitest-bench registrations with retained samples and turns them into baseline
 * result rows (nearest-rank percentiles from the raw samples), printed and saved under
 * bench/.results/ (git-ignored) for the baseline writer.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Bench } from "vitest";
import { summarize } from "../report/stats.js";
import type { BenchResult } from "../report/types.js";
import { toResult } from "../report/write-baseline.js";

export interface Case {
  readonly name: string;
  /** Metric key; selects the target (see report/targets.ts). */
  readonly metric: string;
  readonly fixture: string;
  readonly fn: () => void;
  /** Fixed iteration count for slow operations. Defaults to a 500 ms budget. */
  readonly iterations?: number;
}

export async function runCases(
  bench: Bench,
  cases: readonly Case[],
): Promise<BenchResult[]> {
  const rows: BenchResult[] = [];
  for (const c of cases) {
    const registration = bench(c.name, c.fn);
    const options =
      c.iterations !== undefined
        ? { time: 0, iterations: c.iterations, warmupIterations: 3 }
        : { time: 500 };
    const result = await registration.run({ ...options, retainSamples: true });
    const samples = result.latency.samples;
    if (!samples || samples.length === 0)
      throw new Error(`${c.name}: no samples`);
    rows.push(
      toResult({
        workload: c.name,
        fixture: c.fixture,
        runtime: "node",
        metric: c.metric,
        summary: summarize(samples),
      }),
    );
  }
  return rows;
}

export function saveResults(file: string, rows: readonly BenchResult[]): void {
  const dir = fileURLToPath(new URL("../.results/", import.meta.url));
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}${file}.json`, `${JSON.stringify(rows, null, 2)}\n`);
  const table = rows.map((r) => ({
    workload: r.workload,
    metric: r.metric,
    p50: Number(r.p50.toFixed(4)),
    p95: Number(r.p95.toFixed(4)),
    p99: Number(r.p99.toFixed(4)),
    samples: r.samples,
    status: r.status,
  }));
  console.table(table);
}
