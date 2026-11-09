import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Published package requirement: the published tarball holds only the built output and the package files.
interface PackEntry {
  files: { path: string }[];
}

const pkg = JSON.parse(readFileSync("package.json", "utf8"));

function packedFiles(): string[] {
  const out = execFileSync(
    "npm",
    ["pack", "--dry-run", "--json", "--ignore-scripts"],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    },
  );
  // The package'"'"'s prepare script builds dist first and prints to stdout; the JSON follows.
  const json = out.slice(out.indexOf("\n[") + 1);
  const [entry] = JSON.parse(json) as PackEntry[];
  return (entry?.files ?? []).map((f) => f.path);
}

describe("published package", () => {
  it("tarball holds only dist, package.json, README.md and LICENSE", {
    timeout: 120_000,
  }, () => {
    const files = packedFiles();
    const allowed = new Set(["package.json", "README.md", "LICENSE"]);
    const stray = files.filter(
      (f) => !f.startsWith("dist/") && !allowed.has(f),
    );
    expect(stray).toEqual([]);
    for (const name of allowed) expect(files).toContain(name);
    expect(files.some((f) => f.startsWith("dist/core/index"))).toBe(true);
  });

  it("metadata is public, scoped and registry-ready", () => {
    expect(pkg.name).toBe("@paceholder/nodeeditor-js");
    expect(pkg.private).toBeUndefined();
    expect(pkg.publishConfig).toEqual({ access: "public" });
    expect(pkg.license).toBe("MIT");
    expect(pkg.sideEffects).toBe(false);
    expect(pkg.type).toBe("module");
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(pkg.repository?.url).toContain("nodeeditor-js");
    expect(pkg.engines?.node).toBeTruthy();
  });

  it("names an author and the public repository", () => {
    expect(pkg.author?.name).toBeTruthy();
    expect(pkg.repository.url).toBe(
      "git+https://github.com/paceholder/nodeeditor-js.git",
    );
    expect(pkg.homepage).toBe(
      "https://github.com/paceholder/nodeeditor-js#readme",
    );
  });

  it("declares React and its types as optional peers", () => {
    for (const name of ["react", "react-dom", "@types/react"]) {
      expect(pkg.peerDependencies[name], name).toBeTruthy();
      expect(pkg.peerDependenciesMeta[name]?.optional, name).toBe(true);
    }
  });

  it("publishConfig does not force provenance, which only works in CI", () => {
    expect(pkg.publishConfig.provenance).toBeUndefined();
  });
});
