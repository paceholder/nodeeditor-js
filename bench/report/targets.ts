/** Budgets from the performance spec, as labelled targets (PERF-02, PERF-02a, PERF-02c, PERF-02e). */
import type { Summary } from "./stats.js";

export interface Target {
  readonly p95?: number;
  readonly p99?: number;
  /** Requirement that defines a workload-specific target, shown in the summary. */
  readonly label?: string;
}

export type TargetStatus = "met" | "missed" | "no-target";

/** Targets by metric key. Metrics not listed have no target. */
export const TARGETS: Readonly<Record<string, Target>> = {
  frameIntervalMs: { p95: 16.7, p99: 33.3 },
  latencyMs: { p95: 33 },
  pickMs: { p95: 2 },
  candidateQueryMs: { p95: 2 },
  patchApplyMs: { p95: 4 },
  projectionBuildMs: { p95: 1000 },
  // PERF-02d: animation-frame requests during 5 s of inactivity.
  idleFrameRequests: { p95: 0, p99: 0 },
};

/** PERF-02e: labeled, non-failing targets for the fit-all overview workloads. */
const OVERVIEW_FRAME_TARGET: Target = { p95: 33.3, label: "PERF-02e" };

/** The target of one metric of one workload; overview workloads override the frame interval. */
export function targetFor(
  workload: string,
  metric: string,
): Target | undefined {
  if (
    metric === "frameIntervalMs" &&
    (workload === "overview-zoom" || workload === "overview-pan")
  )
    return OVERVIEW_FRAME_TARGET;
  return TARGETS[metric];
}

export function statusOf(
  summary: Pick<Summary, "p95" | "p99">,
  target: Target | undefined,
): TargetStatus {
  if (!target || (target.p95 === undefined && target.p99 === undefined))
    return "no-target";
  if (target.p95 !== undefined && summary.p95 > target.p95) return "missed";
  if (target.p99 !== undefined && summary.p99 > target.p99) return "missed";
  return "met";
}
