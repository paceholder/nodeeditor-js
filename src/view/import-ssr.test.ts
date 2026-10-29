import { describe, expect, it } from "vitest";

describe("REA-06 view import without browser globals", () => {
  it("imports nodeeditor-js/view in Node without touching window or document", async () => {
    expect(typeof (globalThis as { window?: unknown }).window).toBe(
      "undefined",
    );
    expect(typeof (globalThis as { document?: unknown }).document).toBe(
      "undefined",
    );
    const view = await import("./index.js");
    expect(typeof view.mountView).toBe("function");
    const advanced = await import("./advanced.js");
    expect(typeof advanced.createFrameScheduler).toBe("function");
  });
});
