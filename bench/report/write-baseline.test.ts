import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { summarize } from "./stats.js";
import type { Baseline } from "./types.js";
import {
  renderSummary,
  toResult,
  validateBaseline,
  writeBaseline,
} from "./write-baseline.js";

function sample(quick = false): Baseline {
  return {
    schema: 1,
    commit: "abc123",
    date: "2026-10-30",
    build: "production",
    quick,
    machine: { os: "test-os", cpu: "test-cpu", cores: 8, memoryGiB: 16 },
    browser: { name: "chrome", version: "1.0", headless: false },
    results: [
      toResult({
        workload: "drag",
        fixture: "F-LARGE",
        runtime: "browser",
        metric: "frameIntervalMs",
        dpr: 2,
        summary: summarize([10, 12, 14, 40, 16]),
        visible: { nodes: 900, paths: 1500 },
      }),
      toResult({
        workload: "pick",
        fixture: "F-LARGE",
        runtime: "node",
        metric: "pickMs",
        summary: summarize([0.1, 0.2, 0.3]),
      }),
      toResult({
        workload: "validate",
        fixture: "F-LARGE",
        runtime: "node",
        metric: "validateMs",
        summary: summarize([50, 60]),
      }),
    ],
    bundle: [
      { entry: "core", gzipBytes: 1000, budgetBytes: 76800, status: "met" },
      {
        entry: "view",
        gzipBytes: 200000,
        budgetBytes: 153600,
        status: "missed",
      },
    ],
  };
}

describe("baseline report", () => {
  it("assigns target status per result", () => {
    const [drag, pick, validate] = sample().results;
    expect(drag?.status).toBe("missed");
    expect(pick?.status).toBe("met");
    expect(validate?.status).toBe("no-target");
  });

  it("accepts a schema-valid baseline and rejects a broken one", () => {
    expect(validateBaseline(sample())).toEqual([]);
    expect(validateBaseline({ schema: 2 }).length).toBeGreaterThan(0);
    expect(validateBaseline(null)).toEqual(["not an object"]);
  });

  it("lists missed targets in the summary", () => {
    const text = renderSummary(sample());
    expect(text).toContain("## Missed targets");
    expect(text).toContain("drag / F-LARGE / DPR 2 / frameIntervalMs");
    expect(text).toContain("bundle view");
    expect(text).not.toContain("pick / F-LARGE / DPR");
  });

  it("writes JSON and SUMMARY.md, and refuses quick runs", () => {
    const dir = mkdtempSync(join(tmpdir(), "baseline-"));
    try {
      const file = writeBaseline(dir, sample());
      expect(file.endsWith("2026-10-30-chrome.json")).toBe(true);
      expect(validateBaseline(JSON.parse(readFileSync(file, "utf8")))).toEqual(
        [],
      );
      expect(readFileSync(join(dir, "SUMMARY.md"), "utf8")).toContain(
        "Missed targets",
      );
      expect(() => writeBaseline(dir, sample(true))).toThrow(/quick/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
