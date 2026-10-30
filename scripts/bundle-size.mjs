// Bundle-size report: bundles each entry point the way a consumer would
// (minified ESM, React external) and reports gzip size against the budgets.
// Usage: node scripts/bundle-size.mjs [--enforce]
// Env overrides (KiB): BUNDLE_BUDGET_CORE_KIB, BUNDLE_BUDGET_VIEW_KIB.
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";
import { defaultBudgets, evaluate, KIB, shouldFail } from "./bundle-budget.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const ENTRIES = [
  { entry: "core", path: "src/core/index.ts" },
  { entry: "view", path: "src/view/index.ts" },
  { entry: "advanced", path: "src/view/advanced.ts" },
  { entry: "react", path: "src/react/index.ts" },
];

/** @param {string} path */
async function gzipSizeOf(path) {
  const out = await build({
    absWorkingDir: root,
    entryPoints: [path],
    bundle: true,
    minify: true,
    format: "esm",
    target: "es2022",
    platform: "browser",
    write: false,
    external: ["react", "react-dom", "react/jsx-runtime"],
    logLevel: "silent",
  });
  const file = out.outputFiles[0];
  if (!file) throw new Error(`no output for ${path}`);
  return gzipSync(file.contents, { level: 9 }).length;
}

const sizes = [];
for (const { entry, path } of ENTRIES)
  sizes.push({ entry, gzipBytes: await gzipSizeOf(path) });

const results = evaluate(sizes, defaultBudgets(process.env));
/** @param {number} n */
const kib = (n) => (n / KIB).toFixed(1).padStart(8);
console.log("entry     gzip KiB  budget KiB  status");
for (const r of results) {
  const budget = r.budgetBytes === null ? "       -" : kib(r.budgetBytes);
  console.log(
    `${r.entry.padEnd(8)} ${kib(r.gzipBytes)}  ${budget}  ${r.status}`,
  );
}

const dir = new URL("../bench/.results/", import.meta.url);
mkdirSync(dir, { recursive: true });
writeFileSync(
  new URL("bundle.json", dir),
  `${JSON.stringify(results, null, 2)}\n`,
);

if (process.argv.includes("--enforce") && shouldFail(results)) {
  console.error("bundle-size: a budget was exceeded");
  process.exit(1);
}
