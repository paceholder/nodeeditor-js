/** Finds the earlier baseline to compare with. Node only. */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { PreviousBaseline } from "./compare.js";
import type { Baseline } from "./types.js";
import { validateBaseline } from "./write-baseline.js";

/**
 * `name` when given, else the valid baseline JSON in `dir` with the latest `date`; files
 * of the same date are ordered by modification time. Undefined when there is none.
 */
export function latestBaseline(
  dir: string,
  name?: string,
): PreviousBaseline | undefined {
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    return undefined;
  }
  if (name) files = files.filter((f) => f === name);
  const found = files
    .map((f) => {
      const baseline = JSON.parse(
        readFileSync(join(dir, f), "utf8"),
      ) as Baseline;
      const mtime = statSync(join(dir, f)).mtimeMs;
      return { name: f, baseline, mtime };
    })
    .filter((x) => validateBaseline(x.baseline).length === 0)
    .sort(
      (a, b) =>
        a.baseline.date.localeCompare(b.baseline.date) || a.mtime - b.mtime,
    )
    .at(-1);
  if (name && !found) throw new Error(`baseline to compare not found: ${name}`);
  return found ? { name: found.name, baseline: found.baseline } : undefined;
}
