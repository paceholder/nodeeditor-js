import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const src = (p: string) =>
  fileURLToPath(new URL(`../../src/${p}`, import.meta.url));

// Demo only: resolves the package entry points to source so edits reload at once.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  // Relative asset URLs, so the build works from any directory of a static server.
  base: "./",
  build: {
    outDir: fileURLToPath(new URL("../../demo-dist", import.meta.url)),
    emptyOutDir: true,
    // Symbols ship as real static files (no data: inlining), as a host would serve them.
    assetsInlineLimit: 0,
  },
  resolve: {
    alias: [
      { find: /^nodeeditor-js\/view$/, replacement: src("view/index.ts") },
      { find: /^nodeeditor-js$/, replacement: src("core/index.ts") },
    ],
  },
  server: { fs: { allow: [fileURLToPath(new URL("../..", import.meta.url))] } },
});
