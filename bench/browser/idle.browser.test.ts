/// <reference types="@vitest/browser-playwright" />
/** Idle probe (PERF-02d, LAY-02): no animation frames are requested while nothing happens. */
import { expect, it } from "vitest";
import { DEFAULT_SEED, F_TYPICAL } from "../fixtures/fixture-specs.js";
import {
  browserInfo,
  mountFixture,
  saveBrowserResult,
  settle,
} from "./harness.js";

it("PERF-02d, LAY-02: zero animation-frame requests over 5 s of inactivity", async () => {
  const mounted = await mountFixture(F_TYPICAL, DEFAULT_SEED, 1);
  try {
    await settle(1_000); // first paint has settled
    const native = window.requestAnimationFrame.bind(window);
    let requests = 0;
    window.requestAnimationFrame = (cb) => {
      requests++;
      return native(cb);
    };
    const before = mounted.view.renderStats().framesPainted;
    // Wait on a timer: waiting with animation frames would count as requests itself.
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    window.requestAnimationFrame = native;
    expect(requests).toBe(0);
    expect(mounted.view.renderStats().framesPainted).toBe(before);
    await saveBrowserResult(`idle-dpr${window.devicePixelRatio}`, {
      browser: await browserInfo(),
      dpr: window.devicePixelRatio,
      animationFrameRequests: requests,
      seconds: 5,
    });
  } finally {
    mounted.dispose();
  }
}, 30_000);
