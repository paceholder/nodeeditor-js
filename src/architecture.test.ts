/// <reference types="node" />
/**
 * Import-direction check (REA-02, REN-02, PKG-03): parses every import in `src` and fails
 * on an edge that breaks the layer order below, on a runtime import cycle between files,
 * and on view or react code reaching core other than through `src/core/index.ts`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Layers, lowest first. A file belongs to the entry with the longest matching path (a
 * folder prefix ending in "/", or an exact file). A file may import from its own layer
 * and from any lower rank. Layers that share a rank are siblings and must not import
 * each other.
 */
const LAYERS: readonly { layer: string; rank: number; path: string }[] = [
  { layer: "core/base", rank: 0, path: "src/core/base/" },
  { layer: "core/data", rank: 1, path: "src/core/data/" },
  { layer: "core/edit", rank: 2, path: "src/core/edit/" },
  { layer: "core/io", rank: 3, path: "src/core/io/" },
  { layer: "core/facade", rank: 4, path: "src/core/graph-model.ts" },
  { layer: "core/facade", rank: 4, path: "src/core/index.ts" },
  { layer: "view/mount", rank: 8, path: "src/view/index.ts" },
  { layer: "react", rank: 9, path: "src/react/" },
];

/** The only file outside core that view and react may import from core. */
const CORE_ENTRY = "src/core/index.ts";

/**
 * Test-only support files (fixtures, builders, harnesses). Like tests, they may import
 * from anywhere; in exchange no library file may import them.
 */
const TEST_SUPPORT: readonly RegExp[] = [
  /fixtures[^/]*\.ts$/, // model and scene fixtures
  /\/test-helpers\.ts$/, // model record builders
  /\/test-kit\.ts$/, // command and snapshot test kits
  /\/test-setup\.ts$/, // patch test setup
];

interface Edge {
  readonly from: string;
  readonly to: string;
  readonly specifier: string;
  readonly typeOnly: boolean;
}

const isTest = (file: string): boolean => /\.test\.tsx?$/.test(file);
const isSupport = (file: string): boolean =>
  TEST_SUPPORT.some((re) => re.test(file));

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const path = posix.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(path));
    else if (/\.tsx?$/.test(entry.name)) out.push(path);
  }
  return out.sort();
}

// Biome formats every static import/export-from into one of these shapes.
const STATIC =
  /^(import|export)\s+(type\s+)?(\{[^}]*\}|\*(?:\s+as\s+\w+)?|\w+(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+))?)\s+from\s+"([^"]+)";/gm;
const BARE = /^import\s+"([^"]+)";/gm;
const ANY_FROM = /\bfrom\s+"[^"]+";$/gm;

function allTypeSpecifiers(clause: string): boolean {
  if (!clause.startsWith("{")) return false;
  const names = clause
    .slice(1, -1)
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return names.length > 0 && names.every((s) => s.startsWith("type "));
}

function parse(file: string): {
  imports: { specifier: string; typeOnly: boolean }[];
  problems: string[];
} {
  const text = readFileSync(join(ROOT, file), "utf8");
  const imports: { specifier: string; typeOnly: boolean }[] = [];
  const problems: string[] = [];
  for (const m of text.matchAll(STATIC)) {
    const [, , typeKw, clause = "", specifier = ""] = m;
    imports.push({
      specifier,
      typeOnly: typeKw !== undefined || allTypeSpecifiers(clause),
    });
  }
  for (const m of text.matchAll(BARE))
    imports.push({ specifier: m[1] ?? "", typeOnly: false });
  const fromCount = [...text.matchAll(ANY_FROM)].length;
  const staticCount = [...text.matchAll(STATIC)].length;
  if (fromCount !== staticCount)
    problems.push(`${file}: an import/export statement has an unparsed shape`);
  if (/\bimport\s*\(/.test(text)) problems.push(`${file}: dynamic import()`);
  if (/\brequire\s*\(/.test(text)) problems.push(`${file}: require()`);
  return { imports, problems };
}

function resolveSpecifier(from: string, specifier: string): string {
  return posix.normalize(
    posix.join(posix.dirname(from), specifier.replace(/\.js$/, ".ts")),
  );
}

function layerOf(file: string): (typeof LAYERS)[number] | undefined {
  let best: (typeof LAYERS)[number] | undefined;
  for (const entry of LAYERS) {
    const hit = entry.path.endsWith("/")
      ? file.startsWith(entry.path)
      : file === entry.path;
    if (hit && (!best || entry.path.length > best.path.length)) best = entry;
  }
  return best;
}

const ALL_FILES = listFiles("src");
const KNOWN = new Set(ALL_FILES);
const LIBRARY = ALL_FILES.filter((f) => !isTest(f) && !isSupport(f));

function collect(): { edges: Edge[]; problems: string[] } {
  const edges: Edge[] = [];
  const problems: string[] = [];
  for (const file of LIBRARY) {
    const parsed = parse(file);
    problems.push(...parsed.problems);
    for (const { specifier, typeOnly } of parsed.imports) {
      if (!specifier.startsWith(".")) {
        if (file.startsWith("src/core/"))
          problems.push(`${file} -> "${specifier}": core imports no package`);
        continue;
      }
      const to = resolveSpecifier(file, specifier);
      if (!KNOWN.has(to))
        problems.push(`${file} -> "${specifier}": unresolved import`);
      else edges.push({ from: file, to, specifier, typeOnly });
    }
  }
  return { edges, problems };
}

const { edges: EDGES, problems: PARSE_PROBLEMS } = collect();

function describeEdge(e: Edge): string {
  return `${e.from} -> ${e.to}${e.typeOnly ? " (type)" : ""}`;
}

/** Runtime cycles between files (type-only imports are erased and exempt). */
function runtimeCycles(): string[][] {
  const next = new Map<string, string[]>();
  for (const e of EDGES)
    if (!e.typeOnly) next.set(e.from, [...(next.get(e.from) ?? []), e.to]);
  const cycles: string[][] = [];
  const state = new Map<string, "open" | "done">();
  const stack: string[] = [];
  const visit = (file: string): void => {
    state.set(file, "open");
    stack.push(file);
    for (const to of next.get(file) ?? []) {
      const s = state.get(to);
      if (s === "open") cycles.push([...stack.slice(stack.indexOf(to)), to]);
      else if (s === undefined) visit(to);
    }
    stack.pop();
    state.set(file, "done");
  };
  for (const file of LIBRARY) if (!state.has(file)) visit(file);
  return cycles;
}

describe("REA-02 REN-02 PKG-03 import directions", () => {
  it("parses every import statement, with no dynamic import or require", () => {
    expect(PARSE_PROBLEMS).toEqual([]);
    expect(EDGES.length).toBeGreaterThan(0);
  });

  it("places every library file in a layer", () => {
    const unplaced = LIBRARY.filter((f) => layerOf(f) === undefined);
    expect(unplaced, "files that match no layer").toEqual([]);
  });

  it("imports only from the same or a lower layer, never from a sibling", () => {
    const broken: string[] = [];
    for (const e of EDGES) {
      const a = layerOf(e.from);
      const b = layerOf(e.to);
      if (!a || !b || a.layer === b.layer) continue;
      if (b.rank > a.rank)
        broken.push(`${describeEdge(e)}: ${a.layer} imports higher ${b.layer}`);
      else if (b.rank === a.rank)
        broken.push(`${describeEdge(e)}: siblings ${a.layer} and ${b.layer}`);
    }
    expect(broken).toEqual([]);
  });

  it("reaches core from view and react only through src/core/index.ts", () => {
    const broken = EDGES.filter(
      (e) =>
        !e.from.startsWith("src/core/") &&
        e.to.startsWith("src/core/") &&
        e.to !== CORE_ENTRY,
    ).map(describeEdge);
    expect(broken).toEqual([]);
  });

  it("has no runtime import cycle between files", () => {
    const cycles = runtimeCycles().map((c) => c.join(" -> "));
    expect(cycles).toEqual([]);
  });

  it("never imports a test-support file from library code", () => {
    const broken = EDGES.filter((e) => isSupport(e.to)).map(describeEdge);
    expect(broken).toEqual([]);
  });

  it("lists test-support exclusions that all still match a file", () => {
    const unused = TEST_SUPPORT.filter(
      (re) => !ALL_FILES.some((f) => re.test(f)),
    ).map(String);
    expect(unused).toEqual([]);
  });
});
