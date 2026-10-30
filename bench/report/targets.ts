/** Budgets from the performance spec, as labelled targets. */
import type { Summary } from "./stats.js";

export interface Target {
  readonly p95?: number;
  readonly p99?: number;
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
  // The idle and lifecycle rule: animation-frame requests during 5 s of inactivity.
  idleFrameRequests: { p95: 0, p99: 0 },
};

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
