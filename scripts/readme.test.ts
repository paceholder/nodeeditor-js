import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readme = readFileSync("README.md", "utf8");

describe("README for the registry page", () => {
  it("shows a core-and-view example, a React example and the support line", () => {
    expect(readme).toContain("mountView(");
    expect(readme).toContain("createGraphModel(");
    expect(readme).toContain("<NodeEditor");
    expect(readme).toContain("ESM only, Node 20+, evergreen browsers");
    expect(readme).toMatch(/Stability:/);
  });

  it("explains which TypeScript module resolution settings work", () => {
    expect(readme).toMatch(/moduleResolution/);
    for (const mode of ["bundler", "node16", "nodenext"]) {
      expect(readme).toContain(`\`${mode}\``);
    }
  });

  it("links to documentation only by absolute address", () => {
    const targets = [...readme.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]);
    expect(targets.length).toBeGreaterThan(5);
    for (const target of targets) expect(target).toMatch(/^https:\/\//);
    // Plain mentions of repository paths in backticks would not resolve either.
    expect(readme).not.toMatch(/`docs\//);
  });

  it("makes no claim that is false before or after the first publish", () => {
    expect(readme).not.toMatch(/available after/i);
    expect(readme).not.toMatch(/not published/i);
    expect(readme).not.toMatch(/live demo/i);
    expect(readme).not.toMatch(/npm run build/);
  });
});
