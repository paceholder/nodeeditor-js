// Consumer smoke build configuration, driven by environment variables set by
// scripts/consumer-smoke.mjs: SMOKE_ENTRY (file), SMOKE_OUT (folder), SMOKE_SSR=1 (Node
// bundle with every dependency inlined), SMOKE_DEDUPE=1 (the host's dedupe setting).
import { defineConfig } from "vite";

const entry = process.env.SMOKE_ENTRY ?? "entry-core.ts";
const outDir = process.env.SMOKE_OUT ?? "out";
const ssr = process.env.SMOKE_SSR === "1";
const dedupe = process.env.SMOKE_DEDUPE === "1";

export default defineConfig({
  logLevel: "warn",
  resolve: { dedupe: dedupe ? ["react", "react-dom"] : [] },
  ssr: { noExternal: true },
  build: ssr
    ? { ssr: entry, outDir, emptyOutDir: true }
    : {
        lib: { entry, formats: ["es"], fileName: "bundle" },
        outDir,
        emptyOutDir: true,
        minify: false,
      },
});
