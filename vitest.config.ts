import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

// Browser tests drive the installed Google Chrome (no browser download).
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "node",
          include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
          exclude: ["src/**/*.browser.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "browser",
          include: ["src/view/**/*.browser.test.ts"],
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
