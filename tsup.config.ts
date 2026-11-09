import { defineConfig } from "tsup";
import { addClientDirective } from "./scripts/client-directive.mjs";

// `treeshake` is left off: its extra Rollup pass appended a second source-map comment to
// every emitted file, and esbuild's own tree shaking already drops unused code.
export default defineConfig((options) => ({
  entry: {
    "core/index": "src/core/index.ts",
    "view/index": "src/view/index.ts",
    "view/advanced": "src/view/advanced.ts",
    "react/index": "src/react/index.ts",
  },
  format: ["esm"],
  target: "es2022",
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: true,
  external: ["react", "react-dom"],
  onSuccess: () => addClientDirective(options.outDir ?? "dist"),
}));
