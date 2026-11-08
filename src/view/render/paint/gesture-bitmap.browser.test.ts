/// <reference types="@vitest/browser-playwright" />
import { describe, expect, it, vi } from "vitest";
import { nodeId } from "../../../core/index.js";
import {
  buildModel,
  type ConnSpec,
  type NodeSpec,
  twoPortNode,
} from "../../../core/space/scene/scene-fixtures.js";
import {
  cleanupScope,
  frames,
  makeHost,
  pixelAt,
  selNode,
} from "../../browser-support.js";
import { mountView } from "../../mount-view.js";
import type { FrameClock } from "../../platform/frame-scheduler.js";
import type { ViewHandle, ViewOptions } from "../../view-types.js";
import {
  copyTransform,
  DEFAULT_GESTURE_BITMAP,
  uncoveredFraction,
  zoomRatioWithin,
} from "./gesture-bitmap.js";

const cleanup = cleanupScope();

/**
 * 40 x 40 nodes 100 apart, each row chained: 1600 nodes and 1560 connections, so every
 * entity is visible at the fit-all viewport below and the total (3160) clears the default
 * `minVisible` of 3000. Grid x spans 50..450 CSS px; 460..600 stays empty.
 */
function gridModel() {
  const nodes: NodeSpec[] = [];
  const conns: ConnSpec[] = [];
  for (let j = 0; j < 40; j++) {
    for (let i = 0; i < 40; i++) {
      nodes.push(twoPortNode(`n${j}_${i}`, i * 100, j * 100));
      if (i > 0)
        conns.push([
          `c${j}_${i}`,
          `n${j}_${i - 1}`,
          `n${j}_${i - 1}R`,
          `n${j}_${i}`,
          `n${j}_${i}L`,
        ]);
    }
  }
  return buildModel(nodes, conns);
}

const FIT = { zoom: 0.1, panX: 50, panY: 0 };

/** A frame clock over the real one that counts requests. */
function countingClock(): FrameClock & { readonly requests: number } {
  let requests = 0;
  return {
    request(cb) {
      requests++;
      return requestAnimationFrame(cb);
    },
    cancel: (h) => cancelAnimationFrame(h),
    get requests() {
      return requests;
    },
  };
}

async function mount(extra: Partial<ViewOptions> = {}) {
  const model = gridModel();
  const view = mountView(makeHost(600, 400), {
    model,
    initialViewport: FIT,
    ...extra,
  });
  cleanup(() => {
    view.dispose();
    model.dispose();
  });
  await frames(4);
  return { model, view };
}

describe("gesture bitmap reuse", () => {
  it("option off by default: every pan frame is an exact scene paint", async () => {
    const { view } = await mount();
    const before = view.renderStats().scenePaints;
    for (let i = 0; i < 10; i++) {
      view.viewport.panBy(3, 0);
      await frames(1);
    }
    await frames(2);
    const after = view.renderStats().scenePaints;
    expect(after.exact - before.exact).toBe(10);
    expect(after.reused).toBe(0);
  });

  it("viewport-only frames above minVisible reuse the copy, shifted exactly", async () => {
    const { view } = await mount({ gestureBitmap: { settleMs: 400 } });
    const before = view.renderStats().scenePaints;
    expect(view.renderStats().nodes.painted).toBe(1600);
    for (let i = 0; i < 5; i++) {
      view.viewport.panBy(4, 0);
      await frames(1);
    }
    await frames(1);
    const during = view.renderStats().scenePaints;
    expect(during.exact).toBe(before.exact);
    expect(during.reused - before.reused).toBe(5);
    // An integer pan moves pixels exactly: right of the exposed 20 px strip, the copy
    // matches an exact repaint at the same viewport.
    const scene = view.canvases.scene;
    const region = (): Uint8ClampedArray => {
      const ctx = scene.getContext("2d");
      if (!ctx) throw new Error("no 2d context");
      const x0 = Math.ceil(30 * window.devicePixelRatio);
      return ctx.getImageData(x0, 0, scene.width - x0, scene.height).data;
    };
    const reused = region();
    view.invalidate("scene");
    await frames(2);
    expect(view.renderStats().scenePaints.exact).toBe(before.exact + 1);
    const exact = region();
    let opaque = 0;
    let differing = 0;
    for (let i = 3; i < exact.length; i += 4) {
      if ((exact[i] ?? 0) > 0) opaque++;
      if (exact[i] !== reused[i] || exact[i - 1] !== reused[i - 1]) differing++;
    }
    expect(opaque).toBeGreaterThan(1000);
    expect(differing).toBe(0);
  });

  it("below minVisible every frame stays exact", async () => {
    const { view } = await mount({ gestureBitmap: { minVisible: 10_000 } });
    const before = view.renderStats().scenePaints;
    for (let i = 0; i < 4; i++) {
      view.viewport.panBy(3, 0);
      await frames(1);
    }
    await frames(1);
    const after = view.renderStats().scenePaints;
    expect(after.exact - before.exact).toBe(4);
    expect(after.reused).toBe(0);
  });

  it("settle repaint: exact within settleMs plus a frame, then no frames for 2 s", async () => {
    const clock = countingClock();
    const settleMs = 120;
    const { view } = await mount({
      gestureBitmap: { settleMs },
      frameClock: clock,
    });
    const before = view.renderStats().scenePaints;
    for (let i = 0; i < 8; i++) {
      view.viewport.zoomAt({ x: 300, y: 200 }, i < 4 ? 1.05 : 1 / 1.05);
      await frames(1);
    }
    const stopped = performance.now();
    await frames(1);
    expect(view.renderStats().scenePaints.reused).toBeGreaterThan(
      before.reused,
    );
    const exactAtStop = view.renderStats().scenePaints.exact;
    let settledAt = 0;
    while (performance.now() - stopped < settleMs + 500) {
      await frames(1);
      if (view.renderStats().scenePaints.exact > exactAtStop) {
        settledAt = performance.now();
        break;
      }
    }
    expect(settledAt).toBeGreaterThan(0);
    // Timer resolution and the next animation frame: allow two display periods.
    expect(settledAt - stopped).toBeLessThanOrEqual(settleMs + 34);
    expect(view.renderStats().scenePaints.exact).toBe(exactAtStop + 1);

    const requests = clock.requests;
    const painted = view.renderStats().framesPainted;
    await new Promise((resolve) => setTimeout(resolve, 2000));
    expect(clock.requests).toBe(requests);
    expect(view.renderStats().framesPainted).toBe(painted);
  });

  it("dispose() clears a pending settle timer", async () => {
    const settleMs = 137;
    const { view } = await mount({ gestureBitmap: { settleMs } });
    const set = vi.spyOn(window, "setTimeout");
    const clear = vi.spyOn(window, "clearTimeout");
    cleanup(() => {
      set.mockRestore();
      clear.mockRestore();
    });
    view.viewport.panBy(5, 0);
    const call = set.mock.calls.findIndex((c) => c[1] === settleMs);
    expect(call).toBeGreaterThanOrEqual(0);
    const handle = set.mock.results[call]?.value;
    view.dispose();
    expect(clear).toHaveBeenCalledWith(handle);
  });

  it.each([
    ["model change", "model"],
    ["selection change", "selection"],
    ["theme change", "theme"],
    ["host invalidation", "invalidate"],
  ] as const)(
    "change during a gesture: a %s mid-pan makes the next frame exact",
    async (_label, kind) => {
      const { model, view } = await mount({
        gestureBitmap: { settleMs: 1000 },
      });
      for (let i = 0; i < 3; i++) {
        view.viewport.panBy(2, 0);
        await frames(1);
      }
      await frames(1);
      const before = view.renderStats().scenePaints;
      expect(before.reused).toBeGreaterThan(0);
      view.viewport.panBy(2, 0);
      switch (kind) {
        case "model":
          // Into the empty strip: world x 4800 is CSS x 50 + 8 + 480.
          model.moveNodes([
            { node: nodeId("n0_0"), position: { x: 4800, y: 0 } },
          ]);
          break;
        case "selection":
          view.selection.replace([selNode("n0_0")]);
          break;
        case "theme":
          view.setTheme({ nodeFill: "#405060" });
          break;
        case "invalidate":
          view.invalidate("scene");
          break;
      }
      await frames(1);
      await frames(1);
      const after = view.renderStats().scenePaints;
      expect(after.exact).toBe(before.exact + 1);
      expect(after.reused).toBe(before.reused);
      if (kind === "model") {
        // The moved node is painted at its new place (4 x 2 CSS px at zoom 0.1).
        expect(pixelAt(view.canvases.scene, 538 + 2, 1)[3]).toBeGreaterThan(0);
      }
    },
  );

  it("picking is identical with the option on and off, also mid-gesture", async () => {
    const off = await mount();
    const on = await mount({
      gestureBitmap: { minVisible: 1, settleMs: 1000 },
    });
    for (let i = 0; i < 3; i++) {
      off.view.viewport.panBy(7, 3);
      on.view.viewport.panBy(7, 3);
      await frames(1);
    }
    expect(on.view.renderStats().scenePaints.reused).toBeGreaterThan(0);
    const rectOff = off.view.element.getBoundingClientRect();
    const rectOn = on.view.element.getBoundingClientRect();
    let hits = 0;
    for (let y = 2; y < 400; y += 13) {
      for (let x = 2; x < 600; x += 11) {
        const a = off.view.pick(rectOff.left + x, rectOff.top + y);
        const b = on.view.pick(rectOn.left + x, rectOn.top + y);
        expect(b).toEqual(a);
        hits += a.length;
      }
    }
    expect(hits).toBeGreaterThan(0);
  });

  /**
   * Run `steps` viewport changes, one per frame, and check each frame against the
   * staleness limit relative to the viewport of the last exact frame. Returns how many
   * frames were exact and how many reused.
   */
  async function gesture(
    view: ViewHandle,
    steps: number,
    step: (i: number) => void,
  ): Promise<{ exact: number; reused: number }> {
    let stored = view.viewport.get();
    let exact = 0;
    let reused = 0;
    for (let i = 0; i < steps; i++) {
      const before = view.renderStats().scenePaints;
      step(i);
      await frames(1);
      const after = view.renderStats().scenePaints;
      const vp = view.viewport.get();
      const t = copyTransform(stored, vp, 1);
      const within =
        zoomRatioWithin(t.k, DEFAULT_GESTURE_BITMAP.maxZoomRatio) &&
        uncoveredFraction(t, 600, 400) <=
          DEFAULT_GESTURE_BITMAP.maxUncovered + 1e-9;
      expect(after.exact + after.reused - before.exact - before.reused).toBe(1);
      if (after.exact > before.exact) {
        // Exact only where reuse would have broken a bound.
        expect(within).toBe(false);
        stored = vp;
        exact++;
      } else {
        expect(within).toBe(true);
        reused++;
      }
    }
    return { exact, reused };
  }

  it("long continuous gesture: a zoom sweep paints exactly at each bound crossing", async () => {
    const { view } = await mount({
      gestureBitmap: { minVisible: 1, settleMs: 5000 },
    });
    const z0 = view.viewport.get().zoom;
    // 1.05 per frame: 1.05^4 = 1.22 stays within 1.25, 1.05^5 = 1.28 does not.
    const zoomIn = await gesture(view, 20, () =>
      view.viewport.zoomAt({ x: 300, y: 200 }, 1.05),
    );
    expect(zoomIn).toEqual({ exact: 4, reused: 16 });
    // Zooming out leaves a border, so the uncovered bound is reached first there.
    const zoomOut = await gesture(view, 20, () =>
      view.viewport.zoomAt({ x: 300, y: 200 }, 1 / 1.05),
    );
    expect(zoomOut.exact).toBeGreaterThanOrEqual(4);
    expect(zoomOut.reused).toBeGreaterThan(0);
    expect(view.viewport.get().zoom).toBeCloseTo(z0, 9);
  });

  it("long continuous gesture: a pan paints exactly before a quarter of the view is uncovered", async () => {
    const { view } = await mount({
      gestureBitmap: { minVisible: 1, settleMs: 5000 },
    });
    // 10 px a frame: 15 frames uncover exactly 150 / 600 = 0.25, the 16th is exact.
    const right = await gesture(view, 48, () => view.viewport.panBy(10, 0));
    expect(right).toEqual({ exact: 3, reused: 45 });
    const diagonal = await gesture(view, 40, () => view.viewport.panBy(-6, 5));
    expect(diagonal.exact).toBeGreaterThan(0);
    expect(diagonal.reused).toBeGreaterThan(diagonal.exact);
  });
});
