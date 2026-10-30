/** Baseline file schema, version 1 (design D6). */
import type { Target, TargetStatus } from "./targets.js";

export interface MachineInfo {
  readonly os: string;
  readonly cpu: string;
  readonly cores: number;
  readonly memoryGiB: number;
}

export interface BrowserInfo {
  readonly name: string;
  readonly version: string;
  readonly headless: boolean;
}

export interface BenchResult {
  readonly workload: string;
  readonly fixture: string;
  /** Absent for headless (Node) results. */
  readonly dpr?: number;
  /** "node" for headless results, "browser" for frame workloads. */
  readonly runtime: "node" | "browser";
  readonly metric: string;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly samples: number;
  readonly visible?: { readonly nodes: number; readonly paths: number };
  readonly target?: Target;
  readonly status: TargetStatus;
}

export interface BundleResult {
  readonly entry: string;
  readonly gzipBytes: number;
  readonly budgetBytes: number | null;
  readonly status: "met" | "missed" | "no-target";
}

export interface Baseline {
  readonly schema: 1;
  readonly commit: string;
  readonly date: string;
  readonly build: "production" | "development";
  readonly quick: boolean;
  readonly machine: MachineInfo;
  readonly browser: BrowserInfo;
  /** Free-text caveats printed in the summary (method limits, run conditions). */
  readonly notes?: readonly string[];
  readonly results: readonly BenchResult[];
  readonly bundle: readonly BundleResult[];
}
