import { describe, expect, it, vi } from "vitest";

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

  it("PKG-05 importing the view entries touches no navigator (clipboard is read at mount)", async () => {
    const before = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    let reads = 0;
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      get() {
        reads += 1;
        return undefined;
      },
    });
    try {
      vi.resetModules();
      const view = await import("./index.js");
      const advanced = await import("./advanced.js");
      expect(typeof view.mountView).toBe("function");
      expect(typeof advanced.createClipboardService).toBe("function");
      expect(reads).toBe(0);
    } finally {
      if (before) Object.defineProperty(globalThis, "navigator", before);
      else delete (globalThis as { navigator?: unknown }).navigator;
    }
  });
});
