/** Entry of `npm run bench:baseline`'s last step: .results/ to baseline/ (bundled by esbuild). */
import { fileURLToPath } from "node:url";
import { assemble } from "./assemble.js";
import { latestBaseline } from "./previous.js";
import { writeBaseline } from "./write-baseline.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const dir = `${root}bench/baseline`;
const date = new Date().toISOString().slice(0, 10);
const baseline = assemble(`${root}bench/.results`, date);
// The newest committed baseline (or BENCH_BASELINE_COMPARE, a file name in bench/baseline)
// is compared with in SUMMARY.md; BENCH_BASELINE_SUFFIX names a second run of one day.
const previous = latestBaseline(dir, process.env.BENCH_BASELINE_COMPARE);
const suffix = process.env.BENCH_BASELINE_SUFFIX;
const file = writeBaseline(dir, baseline, {
  ...(suffix ? { suffix } : {}),
  ...(previous ? { previous } : {}),
});
console.log(
  `baseline written: ${file}${previous ? ` (compared with ${previous.name})` : ""}`,
);
