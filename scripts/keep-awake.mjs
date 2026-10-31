// Keeps a macOS machine and its display awake while long benchmark runs execute. A display
// that turns off mid-run makes Chrome drop the test runner's connection (headed or
// headless), and the idle system sleep that follows stops the run. On battery, macOS also
// lowers CPU performance, so the numbers would not be comparable; that only warns.
// Elsewhere this does nothing. As a CLI it runs the given command:
//   node scripts/keep-awake.mjs npx vitest run ...
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** Holds a `caffeinate -d -i` assertion until this process exits. */
export function keepAwake() {
  if (process.platform !== "darwin") return;
  const batt = spawnSync("pmset", ["-g", "batt"], { encoding: "utf8" });
  if (batt.stdout?.includes("'Battery Power'")) {
    console.warn(
      "keep-awake: running on battery; macOS throttles the CPU, so plug in for numbers worth recording",
    );
  }
  const child = spawn("caffeinate", ["-d", "-i", "-w", String(process.pid)], {
    stdio: "ignore",
  });
  child.on("error", () => {
    console.warn(
      "keep-awake: caffeinate is unavailable; the display may sleep",
    );
  });
  child.unref();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, ...args] = process.argv.slice(2);
  if (!cmd) {
    console.error("usage: node scripts/keep-awake.mjs <command> [args...]");
    process.exit(2);
  }
  keepAwake();
  const r = spawnSync(cmd, args, { stdio: "inherit" });
  process.exit(r.status ?? 1);
}
