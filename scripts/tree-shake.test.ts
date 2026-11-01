/**
 * Tree shaking of routers: a consumer that never calls `createOrthogonalRouter`
 * does not bundle the orthogonal router. Bundled with esbuild as `bundle-size.mjs` does.
 */
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));

async function bundledBytes(names: readonly string[]): Promise<number> {
  const contents = `import { ${names.join(", ")} } from "./src/core/index.ts";\nconsole.log(${names.join(", ")});\n`;
  const out = await build({
    absWorkingDir: root,
    stdin: { contents, resolveDir: root, loader: "ts" },
    bundle: true,
    minify: true,
    format: "esm",
    target: "es2022",
    platform: "neutral",
    write: false,
    logLevel: "silent",
  });
  const file = out.outputFiles[0];
  if (!file) throw new Error("no bundle output");
  return file.contents.length;
}

describe("unused routers are not bundled", () => {
  it("Unused router not bundled: a scene with a registry is at least 1 KiB smaller without the orthogonal router", async () => {
    const base = await bundledBytes([
      "createGeometryScene",
      "createRouteRegistry",
    ]);
    const withOrthogonal = await bundledBytes([
      "createGeometryScene",
      "createRouteRegistry",
      "createOrthogonalRouter",
    ]);
    expect(withOrthogonal - base).toBeGreaterThanOrEqual(1024);
  }, 30_000);
});
