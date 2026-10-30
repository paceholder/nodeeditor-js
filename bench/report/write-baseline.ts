/**
 * Baseline assembly, validation and output (PERF-01, design D6). Quick runs are refused:
 * only full-duration runs may become the committed baseline. Numbers are never pooled
 * across DPRs or browsers; each result row stands alone.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Summary } from "./stats.js";
import { statusOf, targetFor } from "./targets.js";
import type { Baseline, BenchResult } from "./types.js";

export interface ResultInput {
  readonly workload: string;
  readonly fixture: string;
  readonly runtime: "node" | "browser";
  readonly metric: string;
  readonly summary: Summary;
  readonly dpr?: number;
  readonly visible?: { readonly nodes: number; readonly paths: number };
}

/** Build a result row, attaching the metric's target and its status. */
export function toResult(input: ResultInput): BenchResult {
  const target = targetFor(input.workload, input.metric);
  return {
    workload: input.workload,
    fixture: input.fixture,
    runtime: input.runtime,
    metric: input.metric,
    ...(input.dpr !== undefined ? { dpr: input.dpr } : {}),
    p50: input.summary.p50,
    p95: input.summary.p95,
    p99: input.summary.p99,
    samples: input.summary.samples,
    ...(input.visible ? { visible: input.visible } : {}),
    ...(target ? { target } : {}),
    status: statusOf(input.summary, target),
  };
}

/** Problems found in a baseline object; empty when it is schema-valid. */
export function validateBaseline(input: unknown): string[] {
  const problems: string[] = [];
  const b = input as Partial<Record<keyof Baseline, unknown>> | null;
  if (typeof b !== "object" || b === null) return ["not an object"];
  if (b.schema !== 1) problems.push("schema must be 1");
  for (const key of ["commit", "date"] as const)
    if (typeof b[key] !== "string") problems.push(`${key} must be a string`);
  if (b.build !== "production" && b.build !== "development")
    problems.push("build must be production or development");
  if (typeof b.quick !== "boolean") problems.push("quick must be a boolean");
  if (typeof b.machine !== "object" || b.machine === null)
    problems.push("machine missing");
  if (typeof b.browser !== "object" || b.browser === null)
    problems.push("browser missing");
  if (!Array.isArray(b.results)) problems.push("results must be an array");
  else
    b.results.forEach((r: Partial<BenchResult>, i) => {
      for (const key of ["p50", "p95", "p99", "samples"] as const)
        if (typeof r[key] !== "number" || !Number.isFinite(r[key]))
          problems.push(`results[${i}].${key} must be a finite number`);
      if (!["met", "missed", "no-target"].includes(r.status ?? ""))
        problems.push(`results[${i}].status invalid`);
    });
  if (!Array.isArray(b.bundle)) problems.push("bundle must be an array");
  return problems;
}

const fmt = (n: number): string => (n >= 100 ? n.toFixed(0) : n.toFixed(2));
const kib = (bytes: number): string => (bytes / 1024).toFixed(1);

function targetText(r: BenchResult): string {
  const t = r.target;
  if (!t) return "-";
  const parts: string[] = [];
  if (t.p95 !== undefined) parts.push(`p95 <= ${t.p95}`);
  if (t.p99 !== undefined) parts.push(`p99 <= ${t.p99}`);
  return t.label ? `${parts.join(", ")} (${t.label})` : parts.join(", ");
}

/** Markdown summary: provenance, result tables, bundle table, missed targets. */
export function renderSummary(b: Baseline): string {
  const out: string[] = [
    `# Performance baseline ${b.date}`,
    "",
    `- Commit: ${b.commit}`,
    `- Build: ${b.build}${b.quick ? " (quick run, not a baseline)" : ""}`,
    `- Browser: ${b.browser.name} ${b.browser.version} (${b.browser.headless ? "headless" : "headed"})`,
    `- Machine: ${b.machine.os}, ${b.machine.cpu}, ${b.machine.cores} cores, ${b.machine.memoryGiB} GiB`,
    "",
    "## Results",
    "",
    "| Runtime | Workload | Fixture | DPR | Metric | p50 | p95 | p99 | Samples | Visible nodes/paths | Target | Status |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const r of b.results) {
    const visible = r.visible ? `${r.visible.nodes}/${r.visible.paths}` : "-";
    out.push(
      `| ${r.runtime} | ${r.workload} | ${r.fixture} | ${r.dpr ?? "-"} | ${r.metric} | ${fmt(r.p50)} | ${fmt(r.p95)} | ${fmt(r.p99)} | ${r.samples} | ${visible} | ${targetText(r)} | ${r.status} |`,
    );
  }
  out.push(
    "",
    "## Bundle size (gzip)",
    "",
    "| Entry | Size KiB | Budget KiB | Status |",
    "| --- | --- | --- | --- |",
  );
  for (const e of b.bundle) {
    const budget = e.budgetBytes === null ? "-" : kib(e.budgetBytes);
    out.push(`| ${e.entry} | ${kib(e.gzipBytes)} | ${budget} | ${e.status} |`);
  }
  const missed = [
    ...b.results
      .filter((r) => r.status === "missed")
      .map(
        (r) =>
          `${r.workload} / ${r.fixture}${r.dpr ? ` / DPR ${r.dpr}` : ""} / ${r.metric}: p95 ${fmt(r.p95)}, p99 ${fmt(r.p99)} (target ${targetText(r)})`,
      ),
    ...b.bundle
      .filter((e) => e.status === "missed")
      .map(
        (e) =>
          `bundle ${e.entry}: ${kib(e.gzipBytes)} KiB (budget ${kib(e.budgetBytes ?? 0)} KiB)`,
      ),
  ];
  if (b.notes && b.notes.length > 0) {
    out.push("", "## Notes", "");
    for (const note of b.notes) out.push(`- ${note}`);
  }
  out.push("", "## Missed targets", "");
  if (missed.length === 0) out.push("None.");
  else for (const line of missed) out.push(`- ${line}`);
  out.push("");
  return out.join("\n");
}

/** File name for a baseline: `<yyyy-mm-dd>-<browser>.json`. */
export function baselineFileName(b: Baseline): string {
  return `${b.date}-${b.browser.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`;
}

/** Write JSON and SUMMARY.md into `dir`. Throws for quick or schema-invalid runs. */
export function writeBaseline(dir: string, b: Baseline): string {
  if (b.quick) throw new Error("quick runs are never written as a baseline");
  const problems = validateBaseline(b);
  if (problems.length > 0)
    throw new Error(`invalid baseline: ${problems.join("; ")}`);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, baselineFileName(b));
  writeFileSync(file, `${JSON.stringify(b, null, 2)}\n`);
  writeFileSync(join(dir, "SUMMARY.md"), renderSummary(b));
  return file;
}
