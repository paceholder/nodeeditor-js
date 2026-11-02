import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

const src = (p: string) =>
  fileURLToPath(new URL(`../src/${p}`, import.meta.url));
const root = fileURLToPath(new URL("..", import.meta.url));

// Benches import the public entry points; the node projects resolve them to source.
const sourceAlias = [
  {
    find: /^nodeeditor-js\/view\/advanced$/,
    replacement: src("view/advanced.ts"),
  },
  { find: /^nodeeditor-js\/view$/, replacement: src("view/index.ts") },
  { find: /^nodeeditor-js$/, replacement: src("core/index.ts") },
];

// The browser project runs against the production build in dist/ (not source), in the
// installed Google Chrome (never a downloaded browser). Chrome is Chromium-based, so the
// Playwright browser name stays "chromium"; results record the real browser version.
const distAlias = [
  {
    find: /^nodeeditor-js\/view\/advanced$/,
    replacement: fileURLToPath(
      new URL("../dist/view/advanced.js", import.meta.url),
    ),
  },
  {
    find: /^nodeeditor-js\/view$/,
    replacement: fileURLToPath(
      new URL("../dist/view/index.js", import.meta.url),
    ),
  },
  {
    find: /^nodeeditor-js$/,
    replacement: fileURLToPath(
      new URL("../dist/core/index.js", import.meta.url),
    ),
  },
];

// Headless: the context emulates the device pixel ratio. Headed: Playwright cannot combine
// a real window (null viewport) with deviceScaleFactor, so the harness applies viewport and
// ratio through CDP metrics emulation instead; BENCH_DPR then selects the single ratio of a run.
const headed = process.env.BENCH_HEADED === "1";
const dprs = process.env.BENCH_DPR ? [Number(process.env.BENCH_DPR)] : [1, 2];
const chrome = (deviceScaleFactor: number) =>
  playwright({
    launchOptions: { channel: "chrome" },
    ...(headed ? {} : { contextOptions: { deviceScaleFactor } }),
  });

export default defineConfig({
  root,
  test: {
    maxWorkers: 1,
    projects: [
      {
        // Headless benches measure the production build too, loaded as plain Node ESM
        // (externalized) so Vite's module runner adds no overhead to the numbers.
        resolve: { alias: distAlias },
        test: {
          name: "node",
          root,
          server: { deps: { external: [/\/dist\//] } },
          environment: "node",
          include: [],
          benchmark: { include: ["bench/headless/**/*.bench.ts"] },
        },
      },
      {
        resolve: { alias: sourceAlias },
        test: {
          name: "unit",
          root,
          environment: "node",
          include: ["bench/**/*.test.ts", "scripts/**/*.test.ts"],
          exclude: ["bench/**/*.browser.test.ts"],
        },
      },
      {
        resolve: { alias: distAlias },
        define: {
          // Quick unless BENCH_QUICK=0 (full length, as bench:baseline runs).
          __BENCH_QUICK__: JSON.stringify(process.env.BENCH_QUICK !== "0"),
          __BENCH_EMULATE_DPR__: JSON.stringify(headed ? (dprs[0] ?? 1) : 0),
          __BENCH_ROUTES__: JSON.stringify(
            process.env.BENCH_ROUTES === "orthogonal" ? "orthogonal" : "bezier",
          ),
        },
        test: {
          name: "browser",
          // One instance at a time: concurrent browsers would disturb each other's frames.
          fileParallelism: false,
          root,
          include: ["bench/browser/**/*.browser.test.ts"],
          browser: {
            enabled: true,
            headless: !headed,
            viewport: { width: 1440, height: 900 },
            instances: dprs.map((dpr) => ({
              browser: "chromium" as const,
              name: `dpr${dpr}`,
              provider: chrome(dpr),
            })),
          },
        },
      },
    ],
  },
});
