/// <reference types="@vitest/browser-playwright" />
import { describe, expect, it } from "vitest";
import { cleanupScope, frames, makeHost } from "./browser-support.js";
import { mountView } from "./mount-view.js";

const cleanup = cleanupScope();

function setup() {
  const view = mountView(makeHost(320, 200));
  cleanup(() => view.dispose());
  return view;
}

describe("viewport notification", () => {
  it("100 pointer-sample pans in one frame yield one notification", async () => {
    const view = setup();
    await frames();
    const seen: Array<{ panX: number }> = [];
    view.on("viewport", (v) => seen.push(v));
    for (let i = 1; i <= 100; i++) view.viewport.panBy(1, 0);
    await frames();
    expect(seen).toHaveLength(1);
    expect(seen[0]?.panX).toBe(100);
  });

  it("no notification without a change", async () => {
    const view = setup();
    await frames();
    let calls = 0;
    view.on("viewport", () => calls++);
    view.viewport.set(view.viewport.get());
    view.viewport.panBy(5, 0);
    view.viewport.panBy(-5, 0);
    await frames();
    expect(calls).toBe(0);
  });

  it("unsubscribe and dispose stop notifications", async () => {
    const view = setup();
    await frames();
    let calls = 0;
    const off = view.on("viewport", () => calls++);
    view.viewport.panBy(1, 0);
    await frames();
    expect(calls).toBe(1);
    off();
    view.viewport.panBy(1, 0);
    await frames();
    expect(calls).toBe(1);
  });
});
