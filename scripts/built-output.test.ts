import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/** Builds the JavaScript (no declarations) into a throwaway folder and inspects it. */
let out = "";

beforeAll(() => {
  out = mkdtempSync(join(tmpdir(), "nodeeditor-built-"));
  execFileSync("npx", ["tsup", "--no-dts", "--out-dir", out], {
    stdio: "ignore",
  });
}, 120_000);

afterAll(() => {
  if (out) rmSync(out, { recursive: true, force: true });
});

const entries = ["core/index", "view/index", "view/advanced", "react/index"];

function jsFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".js"))
    .map((f) => join(dir, f));
}

describe("built output", () => {
  it("only the React entry starts with the client directive", () => {
    for (const entry of entries) {
      const first = readFileSync(join(out, `${entry}.js`), "utf8").split(
        "\n",
        1,
      )[0];
      if (entry === "react/index") expect(first).toBe('"use client";');
      else expect(first).not.toMatch(/use client/);
    }
  });

  it("no other built file carries the client directive", () => {
    const withDirective = jsFiles(out).filter((f) =>
      readFileSync(f, "utf8").startsWith('"use client"'),
    );
    expect(withDirective.map((f) => f.slice(out.length + 1))).toEqual([
      "react/index.js",
    ]);
  });

  it("the source map of the React entry still lines up after the directive is added", () => {
    const map = JSON.parse(
      readFileSync(join(out, "react/index.js.map"), "utf8"),
    ) as { mappings: string };
    // The generated first line has no mapping of its own: the directive was added there.
    expect(map.mappings.startsWith(";")).toBe(true);
  });

  it("every built file has at most one source-map comment", () => {
    for (const file of jsFiles(out)) {
      const count = (
        readFileSync(file, "utf8").match(/^\/\/# sourceMappingURL=/gm) ?? []
      ).length;
      expect(count, file).toBeLessThanOrEqual(1);
    }
  });
});
