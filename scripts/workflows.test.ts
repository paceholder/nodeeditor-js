import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ci = readFileSync(".github/workflows/ci.yml", "utf8");
const release = readFileSync(".github/workflows/release.yml", "utf8");

describe("workflows", () => {
  it("every third-party action is pinned to a full commit with the version in a comment", () => {
    for (const text of [ci, release]) {
      const uses = text.split("\n").filter((l) => /^\s*-?\s*uses:/.test(l));
      expect(uses.length).toBeGreaterThan(0);
      for (const line of uses) {
        expect(line, line).toMatch(/uses: \S+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/);
      }
    }
  });

  it("the check workflow can only read repository contents", () => {
    expect(ci).toMatch(/^permissions:\n {2}contents: read\n/m);
    expect(ci).not.toMatch(/write/);
  });

  it("the release runs in the protected release environment", () => {
    expect(release).toMatch(/^ {4}environment: release$/m);
  });

  it("the release refuses a tagged commit that is not on main", () => {
    expect(release).toContain("merge-base --is-ancestor");
    expect(release).toContain("origin/main");
  });

  it("the release installs one exact npm version", () => {
    expect(release).toMatch(/npm install -g npm@\d+\.\d+\.\d+$/m);
  });

  it("a version with a pre-release part is published under the next dist-tag", () => {
    expect(release).toMatch(/\*-\*\) echo "tag=next"/);
    expect(release).toContain('--tag "$DIST_TAG"');
  });
});
