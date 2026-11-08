import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const src = (p: string) =>
  fileURLToPath(new URL(`../../src/${p}`, import.meta.url));

// Demo only: resolves the package entry points to source so edits reload at once.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: "./",
  build: {
    outDir: fileURLToPath(new URL("../../demo-react-dist", import.meta.url)),
    emptyOutDir: true,
  },
  resolve: {
    alias: [
      { find: /^nodeeditor-js\/react$/, replacement: src("react/index.ts") },
      { find: /^nodeeditor-js\/view$/, replacement: src("view/index.ts") },
      { find: /^nodeeditor-js$/, replacement: src("core/index.ts") },
    ],
  },
  server: { fs: { allow: [fileURLToPath(new URL("../..", import.meta.url))] } },
});
