/** Machine and revision provenance for baseline files. Node only. */
import { execFileSync } from "node:child_process";
import { cpus, platform, release, totalmem } from "node:os";
import type { MachineInfo } from "./types.js";

export function gitCommit(): string {
  try {
    const sha = execFileSync("git", ["rev-parse", "--short=12", "HEAD"], {
      encoding: "utf8",
    }).trim();
    const dirty =
      execFileSync("git", ["status", "--porcelain"], {
        encoding: "utf8",
      }).trim() !== "";
    return dirty ? `${sha}+dirty` : sha;
  } catch {
    return "unknown";
  }
}

export function machineInfo(): MachineInfo {
  const cpu = cpus();
  return {
    os: `${platform()} ${release()}`,
    cpu: cpu[0]?.model ?? "unknown",
    cores: cpu.length,
    memoryGiB: Math.round((totalmem() / 1024 ** 3) * 10) / 10,
  };
}
