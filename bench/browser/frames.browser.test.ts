/// <reference types="@vitest/browser-playwright" />
/**
 * Frame workloads (PERF-02, PERF-02a, PERF-01): pan, zoom and single-node drag on
 * F-TYPICAL and culled F-LARGE at the instance's device pixel ratio, with real input
 * events on the production build. Results go to bench/.results/ for the baseline writer.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SEED,
  F_LARGE,
  F_TYPICAL,
  type FixtureSpec,
  worldSize,
} from "../fixtures/fixture-specs.js";
import {
  browserInfo,
  DURATION_MS,
  mergeSamples,
  mountFixture,
  QUICK,
  REPEATS,
  runWorkload,
  saveBrowserResult,
  settle,
  toInputs,
  VIEW_SIZE,
} from "./harness.js";
import {
  OVERVIEW_WORKLOADS,
  WORKLOADS,
  type WorkloadConfig,
  type WorkloadName,
} from "./workloads.js";

/**
 * Per fixture: the starting zoom and the zoom sweep range. F-LARGE stays at or above 0.4
 * so at most about 1k nodes are visible (PERF-02 "culled F-LARGE"); F-TYPICAL uses the
 * design's 0.25 to 2 range at zoom 1 (about 100 visible) for pan and drag.
 */
const CASES: ReadonlyArray<{
  spec: FixtureSpec;
  zoom: number;
  cfg: WorkloadConfig;
  maxVisibleNodes: number;
}> = [
  {
    spec: F_TYPICAL,
    zoom: 1,
    cfg: { zoomRange: [0.25, 2] },
    maxVisibleNodes: 1_000,
  },
  {
    spec: F_LARGE,
    zoom: 0.4,
    cfg: { zoomRange: [0.4, 2] },
    maxVisibleNodes: 1_000,
  },
];

/**
 * PERF-02e: fit-all zoom (every node visible, 5% margin) and the zoom sweep around it.
 * Gesture bitmap reuse does not exist yet, so every measured frame is a full repaint.
 */
function overviewCase(spec: FixtureSpec): {
  zoom: number;
  cfg: WorkloadConfig;
} {
  const { w, h } = worldSize(spec);
  const zoom = Math.min(VIEW_SIZE.width / w, VIEW_SIZE.height / h) * 0.95;
  return { zoom, cfg: { zoomRange: [zoom * 0.8, zoom * 1.25] } };
}

describe("browser frame workloads", () => {
  for (const c of CASES) {
    const overview = overviewCase(c.spec);
    const runAll = c.spec === F_LARGE;
    const names: readonly WorkloadName[] = runAll
      ? [...WORKLOADS, ...OVERVIEW_WORKLOADS]
      : WORKLOADS;
    it(`PERF-02, PERF-02a, PERF-02e, PERF-01: ${c.spec.name} pan, zoom and drag${runAll ? ", overview pan and zoom" : ""}`, {
      timeout: 30 * 60_000,
    }, async () => {
      const rows = [];
      for (const workload of names) {
        const isOverview = workload.startsWith("overview-");
        const cfg = isOverview ? overview.cfg : c.cfg;
        const mounted = await mountFixture(
          c.spec,
          DEFAULT_SEED,
          workload === "zoom" || workload === "overview-zoom"
            ? Math.sqrt(cfg.zoomRange[0] * cfg.zoomRange[1])
            : isOverview
              ? overview.zoom
              : c.zoom,
        );
        try {
          const runs = [];
          for (let i = 0; i < REPEATS; i++) {
            runs.push(
              await runWorkload(mounted.view, workload, cfg, DURATION_MS),
            );
            await settle(500);
          }
          const merged = mergeSamples(runs);
          expect(merged.frameIntervalMs.length).toBeGreaterThan(30);
          expect(merged.latencyMs.length).toBeGreaterThan(0);
          expect(merged.pickMs.length).toBeGreaterThan(0);
          expect(merged.nodes).toBeGreaterThan(0);
          if (isOverview)
            expect(merged.nodes).toBeGreaterThan(c.spec.nodes * 0.9);
          else if (c.spec === F_LARGE)
            expect(merged.nodes).toBeLessThanOrEqual(c.maxVisibleNodes);
          rows.push(...toInputs(workload, c.spec.name, merged));
        } finally {
          mounted.dispose();
        }
      }
      await saveBrowserResult(
        `browser-${c.spec.name}-dpr${window.devicePixelRatio}`,
        {
          browser: await browserInfo(),
          dpr: window.devicePixelRatio,
          quick: QUICK,
          fixture: c.spec.name,
          rows,
        },
      );
    });
  }
});
