/// <reference types="@vitest/browser-playwright" />
import { afterEach, describe, expect, it } from "vitest";
import { cdp } from "vitest/browser";
import { clearDpr } from "../browser-support.js";
import { mountView } from "../mount-view.js";

const cleanup: Array<() => void | Promise<void>> = [];
// Awaited, so DPR emulation is gone before the next test measures anything.
afterEach(async () => {
  for (const c of cleanup.splice(0).reverse()) await c();
});
const settle = () =>
  new Promise<void>((r) =>
    requestAnimationFrame(() => requestAnimationFrame(() => r())),
  );

function mount(css: string, parent: HTMLElement = document.body) {
  const el = document.createElement("div");
  el.style.cssText = css;
  parent.append(el);
  cleanup.push(() => el.remove());
  const view = mountView(el);
  cleanup.push(() => view.dispose());
  return { el, view };
}

describe("viewport state", () => {
  it("scrolled page with nested offsets", async () => {
    const outer = document.createElement("div");
    outer.style.cssText =
      "position:absolute;left:40px;top:3000px;width:500px;height:400px;padding:20px;";
    document.body.append(outer);
    cleanup.push(() => outer.remove());
    const spacer = document.createElement("div");
    spacer.style.cssText =
      "position:absolute;top:0;left:0;width:1px;height:4000px;";
    document.body.append(spacer);
    cleanup.push(() => spacer.remove());
    const { view } = mount("width:300px;height:200px;margin-left:15px;", outer);
    await settle();
    window.scrollTo(0, 2900);
    cleanup.push(() => window.scrollTo(0, 0));
    const rect = view.element.getBoundingClientRect();
    expect(rect.left).toBeCloseTo(40 + 20 + 15, 5);
    view.viewport.set({ zoom: 2.5, panX: 10, panY: -20 });
    const p = view.clientToWorld(rect.left + 110, rect.top + 30);
    expect(p.ok).toBe(true);
    if (p.ok) {
      expect(p.value.x).toBeCloseTo(40, 6);
      expect(p.value.y).toBeCloseTo(20, 6);
    }
  });

  it("pixel ratio change resizes backing stores", async () => {
    const { view } = mount("width:200px;height:100px;");
    await settle();
    const before = view.metrics().dpr;
    await cdp().send("Emulation.setDeviceMetricsOverride", {
      width: 0,
      height: 0,
      deviceScaleFactor: before === 2 ? 3 : 2,
      mobile: false,
    });
    cleanup.push(clearDpr);
    await new Promise((r) => setTimeout(r, 200));
    // Chrome's emulation changes the ratio but emits no media-query or resize event
    // inside the test iframe, so deliver the resize a real display move would produce.
    window.dispatchEvent(new Event("resize"));
    await settle();
    const after = view.metrics().dpr;
    expect(after).toBe(window.devicePixelRatio);
    expect(after).not.toBe(before);
    expect(view.canvases.scene.width).toBe(Math.round(200 * after));
    // Conversion is unaffected by pixel ratio (CSS pixels in, world out).
    const r = view.element.getBoundingClientRect();
    const p = view.clientToWorld(r.left + 50, r.top + 25);
    expect(p.ok && p.value.x).toBe(50);
  });

  it("zero-size container waits, then recovers", async () => {
    const { el, view } = mount("width:0;height:0;");
    await settle();
    const p = view.clientToWorld(5, 5);
    expect(p.ok).toBe(false);
    expect(view.metrics().width).toBe(0);
    el.style.cssText = "width:120px;height:80px;";
    await settle();
    const q = view.clientToWorld(5, 5);
    expect(q.ok).toBe(true);
    if (q.ok) {
      expect(Number.isNaN(q.value.x)).toBe(false);
    }
    expect(view.canvases.scene.width).toBe(
      Math.round(120 * view.metrics().dpr),
    );
  });
});
