import { describe, expect, it } from "vitest";
import { defaultBudgets, evaluate, KIB, shouldFail } from "./bundle-budget.mjs";

describe("bundle budget comparison", () => {
  const budgets = defaultBudgets({});

  it("defaults to 75 KiB core and 150 KiB view", () => {
    expect(budgets).toEqual({ core: 75 * KIB, view: 150 * KIB });
  });

  it("marks sizes at or under budget as met and over as missed", () => {
    const results = evaluate(
      [
        { entry: "core", gzipBytes: 75 * KIB },
        { entry: "view", gzipBytes: 150 * KIB + 1 },
      ],
      budgets,
    );
    expect(results.map((r) => r.status)).toEqual(["met", "missed"]);
    expect(shouldFail(results)).toBe(true);
  });

  it("reports entries without a budget as no-target and never fails on them", () => {
    const results = evaluate([{ entry: "react", gzipBytes: 10 ** 9 }], budgets);
    expect(results[0]?.status).toBe("no-target");
    expect(results[0]?.budgetBytes).toBeNull();
    expect(shouldFail(results)).toBe(false);
  });

  it("accepts a KiB override from the environment and rejects bad values", () => {
    expect(defaultBudgets({ BUNDLE_BUDGET_CORE_KIB: "1" }).core).toBe(KIB);
    expect(() => defaultBudgets({ BUNDLE_BUDGET_VIEW_KIB: "abc" })).toThrow();
  });
});
