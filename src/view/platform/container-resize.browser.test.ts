import { describe, expect, it } from "vitest";
import { cleanupScope, frames, makeHost, pixelAt } from "../browser-support.js";
import { mountView } from "../mount-view.js";
import type { FrameClock } from "./frame-scheduler.js";

const cleanup = cleanupScope();

/** A frame clock whose frames run only when the test says so. */
function manualClock() {
  const pending = new Map<number, (t: number) => void>();
  let next = 1;
  const clock: FrameClock = {
    request(cb) {
      pending.set(next, cb);
      return next++;
    },
    cancel: (h) => void pending.delete(h),
  };
  return {
    clock,
    run() {
      const batch = [...pending.values()];
      pending.clear();
      for (const cb of batch) cb(performance.now());
    },
  };
}

/**
 * Resolves once the browser delivers resize observations for `el`. Observers created
 * earlier (the view's) are notified first in the same pass.
 */
function observed(el: Element): Promise<void> {
  return new Promise((resolve) => {
    const ro = new ResizeObserver(() => {
      ro.disconnect();
      resolve();
    });
    ro.observe(el);
  });
}

describe("resize without a blank frame", () => {
  it("a container resize repaints before any animation frame runs", async () => {
    const m = manualClock();
    const host = makeHost(200, 150);
    const view = mountView(host, {
      frameClock: m.clock,
      theme: {
        background: "#ff0000",
        gridMinor: "#ff0000",
        gridMajor: "#ff0000",
      },
    });
    cleanup(() => view.dispose());
    await frames(2);
    m.run();
    expect(pixelAt(view.canvases.background, 10, 10)[0]).toBe(255);
    host.style.width = "320px";
    await observed(host);
    // No frame of the view's own clock ran since the resize, yet the cleared canvas was
    // repainted at the new size.
    expect(view.metrics().width).toBe(320);
    expect(pixelAt(view.canvases.background, 300, 10)[0]).toBe(255);
  });
});
