/// <reference types="@vitest/browser-playwright" />
/**
 * Frame workloads: pan, zoom and single-node drag on
 * F-TYPICAL and culled F-LARGE at the instance's device pixel ratio, with real input
 * events on the production build. Results go to bench/.results/ for the baseline writer.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SEED,
  F_LARGE,
  F_TYPICAL,
  type FixtureSpec,
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
} from "./harness.js";
import { WORKLOADS, type WorkloadConfig } from "./workloads.js";

/**
 * Per fixture: the starting zoom and the zoom sweep range. F-LARGE stays at or above 0.4
 * so at most about 1k nodes are visible (the interaction budgets rule "culled F-LARGE"); F-TYPICAL uses the
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

describe("browser frame workloads", () => {
  for (const c of CASES) {
    it(`${c.spec.name} pan, zoom and drag`, {
      timeout: 30 * 60_000,
    }, async () => {
      const rows = [];
      for (const workload of WORKLOADS) {
        const mounted = await mountFixture(
          c.spec,
          DEFAULT_SEED,
          workload === "zoom"
            ? Math.sqrt(c.cfg.zoomRange[0] * c.cfg.zoomRange[1])
            : c.zoom,
        );
        try {
          const runs = [];
          for (let i = 0; i < REPEATS; i++) {
            runs.push(
              await runWorkload(mounted.view, workload, c.cfg, DURATION_MS),
            );
            await settle(500);
          }
          const merged = mergeSamples(runs);
          expect(merged.frameIntervalMs.length).toBeGreaterThan(30);
          expect(merged.latencyMs.length).toBeGreaterThan(0);
          expect(merged.pickMs.length).toBeGreaterThan(0);
          expect(merged.nodes).toBeGreaterThan(0);
          if (c.spec === F_LARGE)
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
