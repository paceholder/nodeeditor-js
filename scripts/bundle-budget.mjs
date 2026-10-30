// Budget comparison for the bundle-size report (PERF-02c). Pure, so it is unit-tested.

export const KIB = 1024;

/**
 * Budgets in bytes by entry. Entries without one are reported only (react).
 * @param {Record<string, string | undefined>} env
 * @returns {Record<string, number>}
 */
export function defaultBudgets(env = {}) {
  /** @param {string} name @param {number} fallback */
  const kib = (name, fallback) => {
    const raw = env[name];
    if (raw === undefined || raw === "") return fallback * KIB;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0)
      throw new Error(`${name} must be a non-negative number of KiB`);
    return value * KIB;
  };
  return {
    core: kib("BUNDLE_BUDGET_CORE_KIB", 75),
    view: kib("BUNDLE_BUDGET_VIEW_KIB", 150),
  };
}

/**
 * @param {{ entry: string, gzipBytes: number }[]} sizes
 * @param {Record<string, number>} budgets
 * @returns {{ entry: string, gzipBytes: number, budgetBytes: number | null, status: "met" | "missed" | "no-target" }[]}
 */
export function evaluate(sizes, budgets) {
  return sizes.map(({ entry, gzipBytes }) => {
    const budget = budgets[entry];
    if (budget === undefined)
      return { entry, gzipBytes, budgetBytes: null, status: "no-target" };
    return {
      entry,
      gzipBytes,
      budgetBytes: budget,
      status: gzipBytes <= budget ? "met" : "missed",
    };
  });
}

/**
 * Whether `--enforce` must fail the run.
 * @param {{ status: string }[]} results
 */
export function shouldFail(results) {
  return results.some((r) => r.status === "missed");
}
