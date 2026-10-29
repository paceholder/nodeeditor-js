/// <reference types="@vitest/browser-playwright" />
/** Helpers for browser tests: mounted hosts with cleanup, frame waits, pixel probes. */
import { afterEach } from "vitest";
import { cdp } from "vitest/browser";

const cleanups: Array<() => void | Promise<void>> = [];

export function cleanupScope(): (fn: () => void | Promise<void>) => void {
  afterEach(runCleanups);
  return (fn) => void cleanups.push(fn);
}

/** Run registered cleanups in reverse order, awaiting async ones (e.g. DPR resets). */
export async function runCleanups(): Promise<void> {
  for (const c of cleanups.splice(0).reverse()) await c();
}

export function makeHost(width: number, height: number): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = `width:${width}px;height:${height}px;position:relative;`;
  document.body.append(el);
  cleanups.push(() => el.remove());
  return el;
}

export function frames(n = 4): Promise<void> {
  return new Promise((resolve) => {
    const step = (left: number): void => {
      if (left <= 0) resolve();
      else requestAnimationFrame(() => step(left - 1));
    };
    step(n);
  });
}

/** RGBA of one CSS-pixel position of a view canvas. */
export function pixelAt(
  canvas: HTMLCanvasElement,
  cssX: number,
  cssY: number,
): [number, number, number, number] {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  const dpr = window.devicePixelRatio;
  const d = ctx.getImageData(
    Math.round(cssX * dpr),
    Math.round(cssY * dpr),
    1,
    1,
  ).data;
  return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0, d[3] ?? 0];
}

/** Poll until `cond` holds (animation-frame cadence) or fail after `ms`. */
export async function until(cond: () => boolean, ms = 3000): Promise<void> {
  const end = performance.now() + ms;
  while (!cond()) {
    if (performance.now() > end) throw new Error("until: timed out");
    await frames(1);
  }
}

/** A small SVG: a solid rectangle filling its viewBox. */
export function solidSvg(width: number, height: number, color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${color}"/></svg>`;
}

/** Emulate a device pixel ratio for the rest of the test; restored after it. */
export async function setDpr(dpr: number): Promise<void> {
  await cdp().send("Emulation.setDeviceMetricsOverride", {
    width: 0,
    height: 0,
    deviceScaleFactor: dpr,
    mobile: false,
  });
  cleanups.push(clearDpr);
  await new Promise((r) => setTimeout(r, 100));
}

/** Remove DPR emulation and wait until the page reports the real ratio again. */
export async function clearDpr(): Promise<void> {
  await cdp().send("Emulation.clearDeviceMetricsOverride");
  await new Promise((r) => setTimeout(r, 100));
}
