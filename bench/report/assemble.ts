/**
 * Assembles the baseline from the per-suite files in bench/.results/ (headless benches,
 * browser workloads, idle probe, bundle sizes) and writes bench/baseline/. Node only.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gitCommit, machineInfo } from "./provenance.js";
import type {
  Baseline,
  BenchResult,
  BrowserInfo,
  BundleResult,
} from "./types.js";
import { type ResultInput, toResult } from "./write-baseline.js";

interface BrowserFile {
  readonly browser: BrowserInfo;
  readonly dpr: number;
  readonly quick?: boolean;
  readonly fixture?: string;
  readonly rows?: readonly ResultInput[];
  readonly animationFrameRequests?: number;
  readonly seconds?: number;
}

const readJson = <T>(file: string): T =>
  JSON.parse(readFileSync(file, "utf8")) as T;

const names = (dir: string, prefix: string): string[] =>
  readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".json"))
    .sort();

export const METHOD_NOTES: readonly string[] = [
  "Frame interval is the gap between consecutive requestAnimationFrame timestamps while a scripted workload dispatches one input event per frame. Pooled over 3 repeats of 30 s after a 1 s warm-up each; never pooled across DPRs.",
  "Pointer-to-preview latency approximates presentation time: the first animation frame after the one that painted the input's preview, minus the event's dispatch time. Events are dispatched at a random phase of the frame (seeded), as device input arrives. The floor is one display period and the ceiling two, so on a 60 Hz display the 33 ms target means no dropped frame; a 120 Hz display (the headed Mac) has more headroom.",
  "Picking time is one ViewHandle.pick call per frame at the pointer position, timed with performance.now() (100 microsecond resolution in this browser).",
  "F-LARGE workloads keep the zoom at or above 0.4 so at most about 1k nodes are visible; F-TYPICAL pan and drag run at zoom 1, its zoom sweep covers 0.25 to 2.",
  "overview-pan and overview-zoom (PERF-02e) run F-LARGE at fit-all zoom with every node visible, the sweep from 0.8 to 1.25 times the fit zoom; their frame-interval target is p95 <= 33.3 ms. Gesture bitmap reuse is off, so every frame is an exact repaint.",
];

export function assemble(dir: string, date: string): Baseline {
  const results: BenchResult[] = [];
  for (const f of ["snapshot", "scene", "patch"])
    results.push(...readJson<BenchResult[]>(join(dir, `${f}.json`)));

  let browser: BrowserInfo | undefined;
  let quick = false;
  for (const f of names(dir, "browser-")) {
    const file = readJson<BrowserFile>(join(dir, f));
    browser ??= file.browser;
    quick ||= file.quick === true;
    for (const row of file.rows ?? []) results.push(toResult(row));
  }
  for (const f of names(dir, "idle-")) {
    const file = readJson<BrowserFile>(join(dir, f));
    const n = file.animationFrameRequests ?? Number.NaN;
    results.push(
      toResult({
        workload: "idle",
        fixture: "F-TYPICAL",
        runtime: "browser",
        dpr: file.dpr,
        metric: "idleFrameRequests",
        summary: { p50: n, p95: n, p99: n, samples: 1 },
      }),
    );
  }
  if (!browser) throw new Error("no browser results found");

  const bundle = readJson<BundleResult[]>(join(dir, "bundle.json"));
  return {
    schema: 1,
    commit: gitCommit(),
    date,
    build: "production",
    quick,
    machine: machineInfo(),
    browser,
    notes: [
      ...METHOD_NOTES,
      browser.headless
        ? "Browser ran headless: frame pacing may differ from a headed browser on a real display."
        : "Browser ran headed on a real display.",
    ],
    results,
    bundle,
  };
}
