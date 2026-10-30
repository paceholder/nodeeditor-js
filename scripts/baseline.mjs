// Full benchmark run and baseline write (`npm run bench:baseline`): headless benches,
// browser workloads at full duration, bundle sizes, then bench/baseline/<date>-<browser>.json
// and SUMMARY.md. The browser runs headed unless BENCH_HEADLESS=1.
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("..", import.meta.url));
const results = `${root}bench/.results`;

/** @param {string} cmd @param {string[]} args @param {Record<string, string>} [env] */
function run(cmd, args, env = {}) {
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  if (r.status !== 0) {
    console.error(`baseline: "${cmd} ${args.join(" ")}" failed`);
    process.exit(r.status ?? 1);
  }
}

const config = ["--config", "bench/vitest.bench.config.ts"];
rmSync(results, { recursive: true, force: true });
mkdirSync(results, { recursive: true });
run("npm", ["run", "build"]);
run("npx", ["vitest", "bench", ...config, "--project", "node (bench)"]);
const headed = process.env.BENCH_HEADLESS !== "1";
// Headed runs take one device pixel ratio each (see bench/vitest.bench.config.ts).
for (const dpr of headed ? ["1", "2"] : [""]) {
  run("npx", ["vitest", "run", ...config, "--project", "browser*"], {
    BENCH_QUICK: "0",
    BENCH_HEADED: headed ? "1" : "0",
    BENCH_DPR: dpr,
  });
}
run("node", ["scripts/bundle-size.mjs"]);

// The assembler is TypeScript; bundle it in memory and run it as a plain ES module.
const out = await build({
  absWorkingDir: root,
  entryPoints: ["bench/report/assemble-cli.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
  outfile: `${results}/assemble-cli.mjs`,
  logLevel: "silent",
});
const file = `${results}/assemble-cli.mjs`;
writeFileSync(file, out.outputFiles[0]?.text ?? "");
await import(pathToFileURL(file).href);
