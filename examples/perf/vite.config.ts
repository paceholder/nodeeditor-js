import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const src = (p: string) =>
  fileURLToPath(new URL(`../../src/${p}`, import.meta.url));

// Demo only: resolves the package entry points to source so edits reload at once. The
// fixture generator under bench/ is imported directly (it is not part of the package).
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: "./",
  build: {
    outDir: fileURLToPath(new URL("../../demo-perf-dist", import.meta.url)),
    emptyOutDir: true,
  },
  resolve: {
    alias: [
      {
        find: /^@paceholder\/nodeeditor-js\/view$/,
        replacement: src("view/index.ts"),
      },
      {
        find: /^@paceholder\/nodeeditor-js$/,
        replacement: src("core/index.ts"),
      },
    ],
  },
  server: { fs: { allow: [fileURLToPath(new URL("../..", import.meta.url))] } },
});
