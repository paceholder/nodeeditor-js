import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

// Headless examples import the public core entry point; tests resolve it to source.
const coreSource = fileURLToPath(
  new URL("./src/core/index.ts", import.meta.url),
);

// Browser tests drive the installed Google Chrome (no browser download).
export default defineConfig({
  test: {
    projects: [
      {
        resolve: {
          alias: [
            { find: /^@paceholder\/nodeeditor-js$/, replacement: coreSource },
          ],
        },
        test: {
          name: "node",
          include: [
            "src/**/*.test.ts",
            "src/**/*.test.tsx",
            "scripts/**/*.test.ts",
            "examples/**/*.test.ts",
          ],
          exclude: ["src/**/*.browser.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "browser",
          include: [
            "src/view/**/*.browser.test.ts",
            "src/react/**/*.browser.test.ts",
          ],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({ launchOptions: { channel: "chrome" } }),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
