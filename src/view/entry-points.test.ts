/**
 * Public entry points: each public name has exactly one import path. The view
 * entry holds what a host needs to mount and customize an editor, `view/advanced` holds
 * the building blocks, and neither re-exports core.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ENTRIES = {
  core: "src/core/index.ts",
  view: "src/view/index.ts",
  advanced: "src/view/advanced.ts",
} as const;
type Entry = keyof typeof ENTRIES;

/** Every exported name of each entry, values and types, as the compiler sees them. */
function exportedNames(): Record<Entry, Set<string>> {
  const files = Object.values(ENTRIES).map((f) => join(ROOT, f));
  const program = ts.createProgram(files, {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
    noEmit: true,
    skipLibCheck: true,
    types: [],
  });
  const checker = program.getTypeChecker();
  const out = {} as Record<Entry, Set<string>>;
  for (const [entry, file] of Object.entries(ENTRIES) as [Entry, string][]) {
    const source = program.getSourceFile(join(ROOT, file));
    const symbol = source && checker.getSymbolAtLocation(source);
    if (!symbol) throw new Error(`no module symbol for ${file}`);
    out[entry] = new Set(
      checker.getExportsOfModule(symbol).map((s) => s.getName()),
    );
  }
  return out;
}

const NAMES = exportedNames();
const shared = (a: Set<string>, b: Set<string>): string[] =>
  [...a].filter((n) => b.has(n)).sort();

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...listFiles(path));
    else if (/\.(ts|js|html)$/.test(entry.name)) out.push(path);
  }
  return out;
}

describe("one import path per public name", () => {
  it("exports every name from exactly one of view and view/advanced", async () => {
    expect(NAMES.view.size).toBeGreaterThan(0);
    expect(NAMES.advanced.size).toBeGreaterThan(0);
    expect(shared(NAMES.view, NAMES.advanced)).toEqual([]);
    const view = await import("./index.js");
    const advanced = await import("./advanced.js");
    const runtime = new Set(Object.keys(view));
    expect(Object.keys(advanced).filter((n) => runtime.has(n))).toEqual([]);
  });

  it("re-exports no core name from nodeeditor-js/view or view/advanced", () => {
    expect(NAMES.core.size).toBeGreaterThan(0);
    expect(shared(NAMES.core, NAMES.view)).toEqual([]);
    expect(shared(NAMES.core, NAMES.advanced)).toEqual([]);
  });
});

describe("building blocks are separate", () => {
  it("mounts the examples without importing nodeeditor-js/view/advanced", () => {
    const files = [...listFiles("examples/plain-js")];
    expect(files.length).toBeGreaterThan(0);
    const offenders = files.filter((f) =>
      readFileSync(join(ROOT, f), "utf8").includes(
        "nodeeditor-js/view/advanced",
      ),
    );
    expect(offenders).toEqual([]);
  });
});
