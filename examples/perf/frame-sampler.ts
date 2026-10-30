/**
 * Frame sampler for the demo. Runs an animation-frame loop only while the view is
 * painting, and stops 0.5 s after the last painted frame, so an idle editor requests no
 * frames at all (PERF-02d) even with the stats panel open.
 */
import type { ViewHandle } from "nodeeditor-js/view";

export interface IntervalStats {
  readonly frames: number;
  /** Frames per second implied by the mean interval. */
  readonly fps: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly max: number;
  /** Intervals longer than 16.7 ms (a 60 Hz frame budget). */
  readonly slow: number;
}

export interface FrameSampler {
  /** Start sampling if stopped; the loop ends itself when painting stops. */
  wake(): void;
  /** Stats over the last second; undefined when not sampling. */
  recent(): IntervalStats | undefined;
  /** Collect every interval from now until `endRun`. */
  beginRun(): void;
  endRun(): IntervalStats;
  dispose(): void;
}

const WINDOW_MS = 1000;
const IDLE_MS = 500;
const SLOW_MS = 16.7;

export function summarizeIntervals(values: readonly number[]): IntervalStats {
  if (values.length === 0)
    return { frames: 0, fps: 0, p50: 0, p95: 0, p99: 0, max: 0, slow: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p: number): number =>
    sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return {
    frames: values.length,
    fps: 1000 / mean,
    p50: at(50),
    p95: at(95),
    p99: at(99),
    max: sorted[sorted.length - 1] ?? 0,
    slow: values.filter((v) => v > SLOW_MS).length,
  };
}

export function createFrameSampler(view: ViewHandle): FrameSampler {
  let handle = 0;
  let running = false;
  let last: number | undefined;
  let painted = view.renderStats().framesPainted;
  let paintedAt = 0;
  let recent: Array<{ at: number; interval: number }> = [];
  let run: number[] | undefined;

  const tick = (stamp: number): void => {
    handle = 0;
    if (last !== undefined) {
      const interval = stamp - last;
      recent.push({ at: stamp, interval });
      run?.push(interval);
    }
    last = stamp;
    recent = recent.filter((r) => stamp - r.at <= WINDOW_MS);
    const now = view.renderStats().framesPainted;
    if (now !== painted) {
      painted = now;
      paintedAt = stamp;
    }
    if (stamp - paintedAt > IDLE_MS) {
      running = false;
      last = undefined;
      recent = [];
      return;
    }
    handle = requestAnimationFrame(tick);
  };

  return {
    wake() {
      if (running) return;
      running = true;
      last = undefined;
      painted = view.renderStats().framesPainted;
      paintedAt = performance.now();
      handle = requestAnimationFrame(tick);
    },
    recent: () =>
      running && recent.length > 0
        ? summarizeIntervals(recent.map((r) => r.interval))
        : undefined,
    beginRun() {
      run = [];
    },
    endRun() {
      const stats = summarizeIntervals(run ?? []);
      run = undefined;
      return stats;
    },
    dispose() {
      if (handle) cancelAnimationFrame(handle);
      running = false;
    },
  };
}
