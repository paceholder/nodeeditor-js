import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { linesWithCodes } from "./requirement-codes";

/** Builds the package, declarations included, into a throwaway folder. */
let out = "";

beforeAll(() => {
  out = mkdtempSync(join(tmpdir(), "nodeeditor-codes-"));
  execFileSync("npx", ["tsup", "--out-dir", out], { stdio: "ignore" });
}, 180_000);

afterAll(() => {
  if (out) rmSync(out, { recursive: true, force: true });
});

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .map((f) => join(dir, f))
    .filter(
      (f) => f.endsWith(".js") || f.endsWith(".ts") || f.endsWith(".map"),
    );
}

function isText(buffer: Buffer): boolean {
  return !buffer.includes(0);
}

describe("requirement codes", () => {
  it("the codes detector finds the old notation and ignores encoding names", () => {
    // Built from pieces so that this file itself holds no code.
    const dash = "-";
    const sample = [
      `see ABC${dash}12 here`,
      `and WXYZ${dash}03a`,
      `every DEF${dash}* rule`,
      "UTF-16 units",
      "a git SHA-256 hash",
    ];
    expect(linesWithCodes(sample.join("\n"))).toEqual([
      `1: see ABC${dash}12 here`,
      `2: and WXYZ${dash}03a`,
      `3: every DEF${dash}* rule`,
    ]);
  });

  it("no requirement codes ship in the built package", () => {
    const files = filesUnder(out);
    expect(files.some((f) => f.endsWith(".d.ts"))).toBe(true);
    const found = files.flatMap((f) =>
      linesWithCodes(readFileSync(f, "utf8")).map(
        (l) => `${f.slice(out.length + 1)}:${l}`,
      ),
    );
    expect(found).toEqual([]);
  });

  it("no tracked text file outside the archived baseline holds a requirement code", () => {
    const tracked = execFileSync("git", ["ls-files", "-z"], {
      encoding: "utf8",
    })
      .split("\0")
      .filter((f) => f !== "" && !f.startsWith("docs/archive/"));
    const found: string[] = [];
    for (const file of tracked) {
      let buffer: Buffer;
      try {
        buffer = readFileSync(file);
      } catch {
        continue; // deleted in the working tree
      }
      if (!isText(buffer)) continue;
      for (const line of linesWithCodes(buffer.toString("utf8")))
        found.push(`${file}:${line}`);
    }
    expect(found).toEqual([]);
  });
});
